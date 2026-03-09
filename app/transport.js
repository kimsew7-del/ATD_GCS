class BaseWebSocketTransport {
  constructor({ onEnvelope, onStatus }) {
    this.onEnvelope = onEnvelope;
    this.onStatus = onStatus;
    this.socket = null;
    this.reconnectTimer = null;
  }

  connect() {
    this.socket = new WebSocket(this.getWebSocketUrl());
    this.onStatus({ phase: "connecting", detail: this.getConnectingMessage() });

    this.socket.addEventListener("open", () => {
      this.onStatus({ phase: "connected", detail: this.getConnectedMessage() });
    });

    this.socket.addEventListener("message", (message) => {
      const rawMessage = JSON.parse(message.data);
      const envelopes = this.normalizeIncoming(rawMessage);
      for (const envelope of envelopes) {
        this.onEnvelope(envelope);
      }
    });

    this.socket.addEventListener("close", () => {
      this.onStatus({ phase: "reconnecting", detail: this.getReconnectMessage() });
      this.reconnectTimer = window.setTimeout(() => this.connect(), 1000);
    });

    this.socket.addEventListener("error", () => {
      this.onStatus({ phase: "error", detail: this.getErrorMessage() });
    });
  }

  sendCommand(payload) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket not connected");
    }
    this.socket.send(JSON.stringify(payload));
  }

  getWebSocketUrl() {
    throw new Error("getWebSocketUrl must be implemented");
  }

  getConnectingMessage() {
    return "Connecting transport";
  }

  getConnectedMessage() {
    return "Transport connected";
  }

  getReconnectMessage() {
    return "Transport disconnected. Reconnecting...";
  }

  getErrorMessage() {
    return "Transport error";
  }

  normalizeIncoming(message) {
    return [message];
  }
}

export class MockWebSocketTransport extends BaseWebSocketTransport {
  getWebSocketUrl() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}/ws/mock`;
  }

  getConnectingMessage() {
    return "Connecting to mock transport";
  }

  getConnectedMessage() {
    return "Mock WebSocket connected";
  }
}

export class RealATDWebSocketTransport extends BaseWebSocketTransport {
  constructor({ onEnvelope, onStatus, serverUrl }) {
    super({ onEnvelope, onStatus });
    this.serverUrl = serverUrl;
  }

  getWebSocketUrl() {
    return this.serverUrl;
  }

  getConnectingMessage() {
    return `Connecting to ATD server: ${this.serverUrl}`;
  }

  getConnectedMessage() {
    return `ATD server connected: ${this.serverUrl}`;
  }

  getReconnectMessage() {
    return `ATD server disconnected. Reconnecting: ${this.serverUrl}`;
  }

  getErrorMessage() {
    return `ATD server error: ${this.serverUrl}`;
  }

  normalizeIncoming(message) {
    const envelopes = [];

    if (Array.isArray(message)) {
      for (const item of message) {
        envelopes.push(...this.normalizeIncoming(item));
      }
      return envelopes;
    }

    if (!message || typeof message !== "object") {
      return [];
    }

    if (typeof message.channel === "string" && "payload" in message) {
      return [message];
    }

    if (typeof message.type === "string" && "data" in message) {
      return this.normalizeTypedEnvelope(message.type, message.data);
    }

    if (typeof message.topic === "string" && "message" in message) {
      return this.normalizeTypedEnvelope(message.topic, message.message);
    }

    if (message.schema_version && message.request_id && "status" in message) {
      return [{ channel: "command_result", payload: message }];
    }

    if (message.events && Array.isArray(message.events)) {
      return [{ channel: "events", payload: { schema_version: message.schema_version ?? "0.1.0", events: message.events } }];
    }

    if (message.commands && Array.isArray(message.commands)) {
      return [{ channel: "commands", payload: { schema_version: message.schema_version ?? "0.1.0", commands: message.commands } }];
    }

    if (this.looksLikeSetup(message)) {
      return [{ channel: "setup", payload: this.normalizeSetup(message) }];
    }

    if (this.looksLikeVehicle(message)) {
      return [{ channel: "vehicle", payload: this.normalizeVehicle(message) }];
    }

    if (this.looksLikeTracker(message)) {
      return [{ channel: "tracker", payload: this.normalizeTracker(message) }];
    }

    if (this.looksLikeHealth(message)) {
      return [{ channel: "health", payload: this.normalizeHealth(message) }];
    }

    if (this.looksLikeEvent(message)) {
      return [{ channel: "events", payload: { schema_version: message.schema_version ?? "0.1.0", events: [message] } }];
    }

    const multiChannel = [];
    if (message.vehicle) {
      multiChannel.push({ channel: "vehicle", payload: this.normalizeVehicle(message.vehicle) });
    }
    if (message.tracker) {
      multiChannel.push({ channel: "tracker", payload: this.normalizeTracker(message.tracker) });
    }
    if (message.health) {
      multiChannel.push({ channel: "health", payload: this.normalizeHealth(message.health) });
    }
    if (message.setup) {
      multiChannel.push({ channel: "setup", payload: this.normalizeSetup(message.setup) });
    }
    if (message.event) {
      multiChannel.push({ channel: "events", payload: { schema_version: message.schema_version ?? "0.1.0", events: [message.event] } });
    }
    if (message.events && Array.isArray(message.events)) {
      multiChannel.push({ channel: "events", payload: { schema_version: message.schema_version ?? "0.1.0", events: message.events } });
    }
    if (message.commands && Array.isArray(message.commands)) {
      multiChannel.push({ channel: "commands", payload: { schema_version: message.schema_version ?? "0.1.0", commands: message.commands } });
    }
    return multiChannel;
  }

  normalizeTypedEnvelope(type, data) {
    const channel = String(type).toLowerCase();
    if (channel.includes("vehicle")) {
      return [{ channel: "vehicle", payload: this.normalizeVehicle(data) }];
    }
    if (channel.includes("tracker")) {
      return [{ channel: "tracker", payload: this.normalizeTracker(data) }];
    }
    if (channel.includes("health")) {
      return [{ channel: "health", payload: this.normalizeHealth(data) }];
    }
    if (channel.includes("setup") || channel.includes("capability")) {
      return [{ channel: "setup", payload: this.normalizeSetup(data) }];
    }
    if (channel.includes("command")) {
      return [{ channel: "command_result", payload: data }];
    }
    if (channel.includes("event")) {
      return [{
        channel: "events",
        payload: {
          schema_version: data?.schema_version ?? "0.1.0",
          events: Array.isArray(data) ? data : Array.isArray(data?.events) ? data.events : [data],
        },
      }];
    }
    return [];
  }

  looksLikeVehicle(message) {
    return "flight_mode_fc" in message || "armed" in message || "roll_deg" in message || "rc_link_ok" in message;
  }

  looksLikeTracker(message) {
    return "controller_mode" in message || "requested_mode" in message || "target_detected" in message;
  }

  looksLikeHealth(message) {
    return "mavlink_connected" in message || "control_loop_ms" in message || "frame_rate_ok" in message;
  }

  looksLikeSetup(message) {
    return "supported_modes" in message || "supported_commands" in message || "vehicle_type" in message;
  }

  looksLikeEvent(message) {
    return "code" in message && "message" in message && "severity" in message;
  }

  normalizeVehicle(payload = {}) {
    return {
      schema_version: payload.schema_version ?? "0.1.0",
      timestamp: payload.timestamp ?? Date.now() / 1000,
      sequence: payload.sequence ?? 0,
      link_ok: payload.link_ok ?? payload.telemetry_link_ok ?? true,
      armed: payload.armed ?? false,
      flight_mode_fc: payload.flight_mode_fc ?? payload.flight_mode ?? "UNKNOWN",
      roll_deg: payload.roll_deg ?? 0,
      pitch_deg: payload.pitch_deg ?? 0,
      yaw_rate_dps: payload.yaw_rate_dps ?? payload.yaw_rate ?? 0,
      altitude_agl_m: payload.altitude_agl_m ?? payload.altitude_m ?? null,
      battery_voltage: payload.battery_voltage ?? payload.battery_v ?? null,
      battery_remaining_pct: payload.battery_remaining_pct ?? payload.battery_pct ?? null,
      rc_link_ok: payload.rc_link_ok ?? payload.rc_ok ?? true,
      video_link_ok: payload.video_link_ok ?? payload.video_ok ?? true,
      latitude_deg: payload.latitude_deg ?? payload.lat ?? null,
      longitude_deg: payload.longitude_deg ?? payload.lon ?? null,
    };
  }

  normalizeTracker(payload = {}) {
    const predictedX = payload.predicted_center_x_norm ?? payload.bbox_x_norm ?? payload.center_x_norm ?? 0;
    const predictedY = payload.predicted_center_y_norm ?? payload.bbox_y_norm ?? payload.center_y_norm ?? 0;
    const lastStrike = payload.last_strike_completion ?? payload.strike_completion ?? {};
    return {
      schema_version: payload.schema_version ?? "0.1.0",
      timestamp: payload.timestamp ?? Date.now() / 1000,
      sequence: payload.sequence ?? 0,
      controller_mode: payload.controller_mode ?? payload.mode ?? "manual",
      requested_mode: payload.requested_mode ?? payload.request_mode ?? payload.mode ?? "manual",
      target_detected: payload.target_detected ?? payload.detected ?? false,
      target_confidence: payload.target_confidence ?? payload.confidence ?? 0,
      frame_age_ms: payload.frame_age_ms ?? payload.age_ms ?? 0,
      target_lost_since: payload.target_lost_since ?? null,
      continuity_score: payload.continuity_score ?? 0,
      candidate_frames: payload.candidate_frames ?? 0,
      abort_required: payload.abort_required ?? false,
      failsafe_active: payload.failsafe_active ?? ((payload.controller_mode ?? payload.mode) === "failsafe"),
      failsafe_reasons: payload.failsafe_reasons ?? [],
      output_backend: payload.output_backend ?? payload.backend ?? "unknown",
      output_send_ok: payload.output_send_ok ?? true,
      output_failure_count: payload.output_failure_count ?? 0,
      predicted_center_x_norm: predictedX,
      predicted_center_y_norm: predictedY,
      image_velocity_x: payload.image_velocity_x ?? payload.velocity_x ?? 0,
      image_velocity_y: payload.image_velocity_y ?? payload.velocity_y ?? 0,
      scale_rate: payload.scale_rate ?? 0,
      last_envelope_clipped_axes: payload.last_envelope_clipped_axes ?? payload.clipped_axes ?? [],
      frame_timestamp: payload.frame_timestamp ?? payload.timestamp ?? Date.now() / 1000,
      guidance_source: payload.guidance_source ?? payload.source ?? payload.subphase ?? "unknown",
      last_strike_completion: {
        completed: lastStrike.completed ?? false,
        reason: lastStrike.reason ?? null,
      },
      bbox_x_norm: payload.bbox_x_norm ?? predictedX,
      bbox_y_norm: payload.bbox_y_norm ?? predictedY,
      bbox_w_norm: payload.bbox_w_norm ?? payload.bbox_width_norm ?? null,
      bbox_h_norm: payload.bbox_h_norm ?? payload.bbox_height_norm ?? null,
      target_id: payload.target_id ?? payload.track_id ?? null,
      target_latitude_deg: payload.target_latitude_deg ?? payload.target_lat_deg ?? null,
      target_longitude_deg: payload.target_longitude_deg ?? payload.target_lon_deg ?? null,
    };
  }

  normalizeHealth(payload = {}) {
    return {
      schema_version: payload.schema_version ?? "0.1.0",
      timestamp: payload.timestamp ?? Date.now() / 1000,
      sequence: payload.sequence ?? 0,
      mavlink_connected: payload.mavlink_connected ?? payload.fc_connected ?? false,
      mavlink_latency_ms: payload.mavlink_latency_ms ?? payload.fc_latency_ms ?? 0,
      frame_rate_ok: payload.frame_rate_ok ?? true,
      frame_latency_ms: payload.frame_latency_ms ?? payload.video_latency_ms ?? 0,
      control_rate_ok: payload.control_rate_ok ?? true,
      control_loop_ms: payload.control_loop_ms ?? payload.last_cycle_duration_ms ?? 0,
      cycle_budget_warn: payload.cycle_budget_warn ?? false,
      cycle_budget_fraction: payload.cycle_budget_fraction ?? null,
      detector_ok: payload.detector_ok ?? true,
      tracker_ok: payload.tracker_ok ?? true,
      storage_ok: payload.storage_ok ?? true,
    };
  }

  normalizeSetup(payload = {}) {
    return {
      schema_version: payload.schema_version ?? "0.1.0",
      system_name: payload.system_name ?? payload.vehicle_name ?? "ATD v2",
      system_version: payload.system_version ?? payload.version ?? "unknown",
      git_commit: payload.git_commit ?? payload.commit ?? "unknown",
      telemetry_schema_version: payload.telemetry_schema_version ?? payload.schema_version ?? "0.1.0",
      command_schema_version: payload.command_schema_version ?? payload.schema_version ?? "0.1.0",
      event_schema_version: payload.event_schema_version ?? payload.schema_version ?? "0.1.0",
      supported_modes: payload.supported_modes ?? ["manual", "search", "track_cruise", "track_dive"],
      supported_commands: payload.supported_commands ?? [],
      supported_output_backends: payload.supported_output_backends ?? ["sim"],
      enable_dive_mode: payload.enable_dive_mode ?? false,
      vehicle_type: payload.vehicle_type ?? "unknown",
      video_transport: payload.video_transport ?? "unknown",
      log_export_ready: payload.log_export_ready ?? false,
    };
  }
}

export function createTransport({ mode, serverUrl, onEnvelope, onStatus }) {
  if (mode === "real") {
    return new RealATDWebSocketTransport({
      onEnvelope,
      onStatus,
      serverUrl,
    });
  }
  return new MockWebSocketTransport({
    onEnvelope,
    onStatus,
  });
}
