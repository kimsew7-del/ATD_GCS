import { buildMapFallback, extractGeoState, extractVideoMetadata } from "./adapters.js";
import { loadRuntimeConfig, persistRuntimeConfig } from "./config.js";
import { createTransport } from "./transport.js";

const state = {
  vehicle: null,
  tracker: null,
  health: null,
  setup: null,
  events: [],
  commands: [],
};

const videoState = {
  hls: null,
};

const vehiclePanel = document.querySelector("#vehicle-panel");
const trackerPanel = document.querySelector("#tracker-panel");
const healthPanel = document.querySelector("#health-panel");
const eventList = document.querySelector("#event-list");
const commandResult = document.querySelector("#command-result");
const commandBlockers = document.querySelector("#command-blockers");
const commandChecklist = document.querySelector("#command-checklist");
const vehicleMessages = document.querySelector("#vehicle-messages");
const linkWatch = document.querySelector("#link-watch");
const tabs = Array.from(document.querySelectorAll(".tab"));
const views = Array.from(document.querySelectorAll("[data-view-panel]"));
const dockTabs = Array.from(document.querySelectorAll(".dock-tab"));
const dockPanels = Array.from(document.querySelectorAll("[data-dock-panel]"));
const transportBanner = document.querySelector("#transport-banner");
const transportPhase = document.querySelector("#transport-phase");
const transportDetail = document.querySelector("#transport-detail");
const transportModeLabel = document.querySelector("#transport-mode");
const confirmModal = document.querySelector("#confirm-modal");
const confirmTitle = document.querySelector("#confirm-title");
const confirmBody = document.querySelector("#confirm-body");
const confirmCheckbox = document.querySelector("#confirm-checkbox");
const confirmCheckLabel = document.querySelector("#confirm-check-label");
const confirmCancel = document.querySelector("#confirm-cancel");
const confirmAccept = document.querySelector("#confirm-accept");
const runtimeConfig = loadRuntimeConfig();
const videoFeed = document.querySelector("#video-feed");
const videoUrlInput = document.querySelector("#video-url");
const videoLoadButton = document.querySelector("#video-load");
const mapFocusTargetButton = document.querySelector("#map-focus-target");
const mapRthButton = document.querySelector("#map-rth");

let map = null;
let vehicleMarker = null;
let targetMarker = null;
let routeLine = null;
let homeMarker = null;
let headingLine = null;
let trailLine = null;
let targetTrailLine = null;
let returnCorridorLine = null;
let missionAnchorMarker = null;
let geofenceCircle = null;
let vehicleTrail = [];
let targetTrail = [];
let pendingCommand = null;

const DANGEROUS_COMMANDS = {
  disarm: {
    title: "Disarm vehicle",
    body: "Disarm removes armed state immediately. Confirm only when landing is complete or the vehicle is safe.",
    checkLabel: "I confirm the vehicle is on ground or safe to disarm.",
  },
  reset_failsafe_latch: {
    title: "Clear failsafe latch",
    body: "Clear failsafe only after the underlying fault is resolved and operator control is confirmed.",
    checkLabel: "I confirm the failsafe cause has been reviewed and mitigated.",
  },
  "set_requested_mode:strike": {
    title: "Enter strike mode",
    body: "Strike mode increases tracking aggression and terminal closure. Confirm airspace and recovery path first.",
    checkLabel: "I confirm strike entry is intentional and recovery path is understood.",
  },
};

persistRuntimeConfig(runtimeConfig);

const transport = createTransport({
  mode: runtimeConfig.transportMode,
  serverUrl: runtimeConfig.realServerUrl,
  onEnvelope: handleEnvelope,
  onStatus: updateTransportStatus,
});

function sendCommand(command, params = {}) {
  try {
    transport.sendCommand({
      schema_version: "0.1.0",
      request_id: crypto.randomUUID(),
      command,
      params,
      timestamp: Date.now() / 1000,
    });
  } catch (error) {
    commandResult.textContent = String(error);
    return;
  }
}

function requestCommand(command, params = {}) {
  const guardKey = params.mode ? `${command}:${params.mode}` : command;
  const guard = DANGEROUS_COMMANDS[guardKey];
  if (!guard) {
    sendCommand(command, params);
    return;
  }

  pendingCommand = { command, params };
  confirmTitle.textContent = guard.title;
  confirmBody.textContent = guard.body;
  confirmCheckLabel.textContent = guard.checkLabel ?? "I have reviewed the current vehicle state.";
  confirmCheckbox.checked = false;
  confirmAccept.disabled = true;
  confirmModal.hidden = false;
}

function closeConfirmModal() {
  pendingCommand = null;
  confirmModal.hidden = true;
  confirmCheckbox.checked = false;
  confirmAccept.disabled = true;
}

function fmt(value, suffix = "") {
  if (value === null || value === undefined) {
    return "N/A";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number") {
    return `${value.toFixed(1)}${suffix}`;
  }
  if (Array.isArray(value)) {
    return value.length ? value.join(", ") : "[]";
  }
  return String(value);
}

function renderKV(container, entries) {
  container.innerHTML = entries
    .map(
      ([label, value, suffix = ""]) => `
        <div class="kv">
          <span>${label}</span>
          <strong>${fmt(value, suffix)}</strong>
        </div>
      `
    )
    .join("");
}

function renderEvents() {
  eventList.innerHTML = state.events
    .map(
      (event) => `
        <div class="event-item ${event.severity}">
          <p>${event.message}</p>
          <div class="event-meta">
            ${event.code} · ${new Date(event.timestamp * 1000).toLocaleTimeString()}
            ${event.context?.request_id ? ` · <code>${event.context.request_id}</code>` : ""}
          </div>
        </div>
      `
    )
    .join("");
}

function updatePills() {
  const connectionPill = document.querySelector("#connection-pill");
  const modePill = document.querySelector("#mode-pill");
  const failsafePill = document.querySelector("#failsafe-pill");
  const vehicleLink = document.querySelector("#vehicle-link");
  const trackerTarget = document.querySelector("#tracker-target");
  const healthSummary = document.querySelector("#health-summary");

  connectionPill.textContent = state.vehicle.link_ok ? "MOCK LINK OK" : "LINK DOWN";
  connectionPill.className = `pill ${state.vehicle.link_ok ? "ok" : "danger"}`;

  modePill.textContent = state.tracker.controller_mode.toUpperCase();
  const modeClass = state.tracker.controller_mode === "failsafe"
    ? "danger"
    : state.tracker.controller_mode === "strike"
      ? "warn"
      : "ok";
  modePill.className = `pill ${modeClass}`;

  failsafePill.textContent = state.tracker.failsafe_active
    ? state.tracker.failsafe_reasons.join(", ").toUpperCase()
    : "NO FAILSAFE";
  failsafePill.className = `pill ${state.tracker.failsafe_active ? "danger" : "ok"}`;

  vehicleLink.textContent = state.vehicle.link_ok ? "FC LINK OK" : "FC LINK LOST";
  trackerTarget.textContent = state.tracker.target_detected ? "TARGET LOCK" : "TARGET LOST";
  trackerTarget.className = `mini-pill ${state.tracker.target_detected ? "ok" : "warn"}`;

  const healthy = state.health.mavlink_connected && state.health.frame_rate_ok && state.health.control_rate_ok;
  healthSummary.textContent = healthy ? "HEALTHY" : "DEGRADED";
  healthSummary.className = `mini-pill ${healthy ? "ok" : "warn"}`;

  const batteryPct = state.vehicle.battery_remaining_pct ?? 100;
  const batteryState = batteryPct <= 20 ? "danger" : batteryPct <= 40 ? "warn" : "ok";
  document.querySelector("#hero-battery").className = batteryState;
}

function updateHero() {
  document.querySelector("#hero-controller").textContent = state.tracker.controller_mode;
  document.querySelector("#hero-requested").textContent = state.tracker.requested_mode;
  document.querySelector("#hero-target").textContent = state.tracker.target_detected ? "tracking" : "lost";
  document.querySelector("#hero-frame-age").textContent = `${state.tracker.frame_age_ms.toFixed(1)} ms`;
  document.querySelector("#hero-output").textContent = `${state.tracker.output_backend} / ${state.tracker.output_send_ok ? "ok" : "degraded"}`;
  document.querySelector("#hero-continuity").textContent = state.tracker.continuity_score.toFixed(2);
  document.querySelector("#hero-battery").textContent = state.vehicle.battery_remaining_pct == null
    ? "N/A"
    : `${state.vehicle.battery_remaining_pct}%`;
  document.querySelector("#hero-airframe").textContent = state.setup.vehicle_type ?? "N/A";
  document.querySelector("#status-target-state").textContent = state.tracker.target_detected
    ? `locked / ${state.tracker.target_confidence.toFixed(2)}`
    : state.tracker.failsafe_active
      ? "failsafe"
      : "searching";
  document.querySelector("#instrument-failsafe").className = state.tracker.failsafe_active ? "danger" : "ok";
  document.querySelector("#status-target-state").className = state.tracker.target_detected ? "ok" : "warn";

  const priorityText = document.querySelector("#priority-text");
  if (state.tracker.failsafe_active) {
    priorityText.textContent = `Failsafe active: ${state.tracker.failsafe_reasons.join(", ") || "unknown"}`;
    priorityText.className = "danger";
  } else if (state.tracker.last_strike_completion?.completed) {
    priorityText.textContent = `Strike completed: ${state.tracker.last_strike_completion.reason}`;
    priorityText.className = "warn";
  } else if (state.health.cycle_budget_warn) {
    priorityText.textContent = `Control loop budget warning: ${state.health.control_loop_ms.toFixed(1)} ms`;
    priorityText.className = "warn";
  } else if (!state.health.frame_rate_ok) {
    priorityText.textContent = `Vision latency elevated: ${state.health.frame_latency_ms.toFixed(1)} ms`;
    priorityText.className = "warn";
  } else if (!state.tracker.target_detected) {
    priorityText.textContent = `Target not locked in ${state.tracker.controller_mode}`;
    priorityText.className = "warn";
  } else {
    priorityText.textContent = "System nominal";
    priorityText.className = "ok";
  }
}

function updateOperationalCanvas() {
  const trackingBox = document.querySelector("#tracking-box");
  const mapStage = document.querySelector(".map-stage");
  const roll = state.vehicle.roll_deg;
  const pitch = state.vehicle.pitch_deg;
  const xNorm = state.tracker.predicted_center_x_norm;
  const yNorm = state.tracker.predicted_center_y_norm;
  const geoState = extractGeoState(state.vehicle, state.tracker);
  const videoMeta = extractVideoMetadata(state.tracker);

  document.querySelector("#overlay-altitude").textContent = state.vehicle.altitude_agl_m == null
    ? "N/A"
    : `${state.vehicle.altitude_agl_m.toFixed(1)} m`;
  document.querySelector("#overlay-battery").textContent = state.vehicle.battery_remaining_pct == null
    ? "N/A"
    : `${state.vehicle.battery_remaining_pct}%`;
  document.querySelector("#overlay-map-source").textContent = geoState.hasVehicleGeo ? "LIVE GEO" : "FALLBACK";
  document.querySelector("#overlay-track").textContent = state.tracker.target_detected ? "LOCK" : "LOST";
  document.querySelector("#overlay-mode").textContent = state.tracker.controller_mode.toUpperCase();
  document.querySelector("#center-status-label").textContent = state.tracker.failsafe_active
    ? "Failsafe override active"
    : state.tracker.target_detected
      ? "Tracking solution stable"
      : "Waiting for target reacquisition";

  document.querySelector("#instrument-roll").textContent = `${state.vehicle.roll_deg.toFixed(1)} deg`;
  document.querySelector("#instrument-pitch").textContent = `${state.vehicle.pitch_deg.toFixed(1)} deg`;
  document.querySelector("#instrument-yaw").textContent = `${state.vehicle.yaw_rate_dps.toFixed(1)} dps`;
  document.querySelector("#instrument-controller").textContent = state.tracker.controller_mode;
  document.querySelector("#instrument-source").textContent = state.tracker.guidance_source ?? "unknown";
  document.querySelector("#instrument-strike").textContent = state.tracker.last_strike_completion?.completed
    ? state.tracker.last_strike_completion.reason
    : "none";
  document.querySelector("#instrument-failsafe").textContent = state.tracker.failsafe_reasons.length
    ? state.tracker.failsafe_reasons.join(", ")
    : "none";

  const boxX = 50 + Math.max(-20, Math.min(20, videoMeta.bboxX * 45));
  const boxY = 48 + Math.max(-18, Math.min(18, videoMeta.bboxY * 45));
  const boxWidth = videoMeta.bboxW ? Math.max(72, videoMeta.bboxW * 360) : Math.max(72, 96 + state.tracker.target_confidence * 34);
  const boxHeight = videoMeta.bboxH ? Math.max(52, videoMeta.bboxH * 240) : boxWidth * 0.72;
  trackingBox.style.left = `${boxX}%`;
  trackingBox.style.top = `${boxY}%`;
  trackingBox.style.width = `${boxWidth}px`;
  trackingBox.style.height = `${boxHeight}px`;
  trackingBox.style.opacity = state.tracker.target_detected ? "1" : "0.35";
  trackingBox.style.borderColor = state.tracker.failsafe_active ? "var(--danger)" : "var(--warn)";
  mapStage.classList.toggle("geo-live", geoState.hasVehicleGeo);

  document.querySelector("#video-mode").textContent = state.tracker.controller_mode.toUpperCase();
  document.querySelector("#video-confidence").textContent = videoMeta.confidence.toFixed(2);
  document.querySelector("#video-frame-age").textContent = `${state.tracker.frame_age_ms.toFixed(1)} ms`;
  document.querySelector("#video-link").textContent = state.vehicle.video_link_ok ? "GOOD" : "LOSS";
  document.querySelector("#video-track-state").textContent = state.tracker.target_detected
    ? "LOCKED"
    : state.tracker.failsafe_active
      ? "FAILSAFE"
      : "SEARCHING";
  document.querySelector("#video-target-x").textContent = videoMeta.bboxX.toFixed(2);
  document.querySelector("#video-target-y").textContent = videoMeta.bboxY.toFixed(2);
  document.querySelector("#video-target-id").textContent = videoMeta.targetId ?? "N/A";

  updateLeafletMap(roll, pitch, xNorm, yNorm, geoState);
}

function initMap() {
  if (map || !window.L) {
    return;
  }

  map = window.L.map("map-canvas", {
    zoomControl: true,
    attributionControl: true,
  }).setView([37.5665, 126.978], 16);

  window.L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  vehicleMarker = window.L.circleMarker([37.5665, 126.978], {
    radius: 7,
    color: "#72d4ff",
    weight: 2,
    fillColor: "#72d4ff",
    fillOpacity: 0.9,
  }).addTo(map);

  targetMarker = window.L.circleMarker([37.5672, 126.9792], {
    radius: 7,
    color: "#ffc365",
    weight: 2,
    fillColor: "#ffc365",
    fillOpacity: 0.9,
  }).addTo(map);

  routeLine = window.L.polyline(
    [
      [37.5665, 126.978],
      [37.5672, 126.9792],
    ],
    {
      color: "#8ef7b8",
      weight: 3,
      opacity: 0.7,
      dashArray: "8 10",
    }
  ).addTo(map);

  homeMarker = window.L.circleMarker([37.5665, 126.978], {
    radius: 5,
    color: "#77e39a",
    weight: 2,
    fillColor: "#77e39a",
    fillOpacity: 0.95,
  }).addTo(map);

  headingLine = window.L.polyline(
    [
      [37.5665, 126.978],
      [37.5668, 126.9783],
    ],
    {
      color: "#61b5ff",
      weight: 2,
      opacity: 0.9,
    }
  ).addTo(map);

  trailLine = window.L.polyline([], {
    color: "#61b5ff",
    weight: 2,
    opacity: 0.55,
    dashArray: "4 8",
  }).addTo(map);

  targetTrailLine = window.L.polyline([], {
    color: "#ffbf5b",
    weight: 2,
    opacity: 0.5,
    dashArray: "3 6",
  }).addTo(map);

  returnCorridorLine = window.L.polyline(
    [
      [37.5665, 126.978],
      [37.5665, 126.978],
    ],
    {
      color: "#77e39a",
      weight: 2,
      opacity: 0.55,
      dashArray: "10 8",
    }
  ).addTo(map);

  missionAnchorMarker = window.L.circleMarker([37.5661, 126.9775], {
    radius: 4,
    color: "#c992ff",
    weight: 2,
    fillColor: "#c992ff",
    fillOpacity: 0.9,
  }).addTo(map);

  geofenceCircle = window.L.circle([37.5665, 126.978], {
    radius: 180,
    color: "#ffbf5b",
    weight: 1,
    opacity: 0.8,
    fillOpacity: 0.03,
  }).addTo(map);
}

function updateLeafletMap(roll, pitch, xNorm, yNorm, geoState) {
  if (!map || !vehicleMarker || !targetMarker || !routeLine || !homeMarker || !headingLine || !trailLine || !targetTrailLine || !returnCorridorLine || !missionAnchorMarker || !geofenceCircle) {
    return;
  }

  const fallback = buildMapFallback(state.vehicle, state.tracker);
  const vehicleLat = geoState.hasVehicleGeo ? geoState.vehicleLat : fallback.vehicleLat;
  const vehicleLng = geoState.hasVehicleGeo ? geoState.vehicleLng : fallback.vehicleLng;
  const targetLat = geoState.hasTargetGeo ? geoState.targetLat : fallback.targetLat;
  const targetLng = geoState.hasTargetGeo ? geoState.targetLng : fallback.targetLng;

  vehicleMarker.setLatLng([vehicleLat, vehicleLng]);
  targetMarker.setLatLng([targetLat, targetLng]);
  homeMarker.setLatLng([37.5665, 126.978]);
  routeLine.setLatLngs([
    [vehicleLat, vehicleLng],
    [targetLat, targetLng],
  ]);
  const headingLat = vehicleLat + Math.cos((roll / 180) * Math.PI) * 0.00045;
  const headingLng = vehicleLng + Math.sin((pitch / 180) * Math.PI) * 0.00045;
  headingLine.setLatLngs([
    [vehicleLat, vehicleLng],
    [headingLat, headingLng],
  ]);
  vehicleTrail.push([vehicleLat, vehicleLng]);
  vehicleTrail = vehicleTrail.slice(-12);
  trailLine.setLatLngs(vehicleTrail);
  targetTrail.push([targetLat, targetLng]);
  targetTrail = targetTrail.slice(-12);
  targetTrailLine.setLatLngs(targetTrail);
  returnCorridorLine.setLatLngs([
    [vehicleLat, vehicleLng],
    [37.5665, 126.978],
  ]);
  missionAnchorMarker.setLatLng([37.5661, 126.9775]);
  geofenceCircle.setLatLng([37.5665, 126.978]);
  map.panTo([vehicleLat, vehicleLng], { animate: true, duration: 0.5 });
}

function loadVideoStream(url) {
  if (videoState.hls) {
    videoState.hls.destroy();
    videoState.hls = null;
  }
  if (!url) {
    commandResult.textContent = "Video URL is empty";
    return;
  }

  if (window.Hls?.isSupported() && url.endsWith(".m3u8")) {
    const hls = new window.Hls();
    hls.loadSource(url);
    hls.attachMedia(videoFeed);
    videoState.hls = hls;
    commandResult.textContent = `Loaded HLS stream: ${url}`;
    return;
  }

  videoFeed.src = url;
  videoFeed.play().catch(() => {
    commandResult.textContent = `Video source attached: ${url}`;
  });
}

function updateAlerts() {
  const messages = [];

  if (state.tracker.failsafe_active) {
    messages.push({
      level: "danger",
      title: "Failsafe Active",
      body: state.tracker.failsafe_reasons.join(", ") || "Unknown reason",
    });
  } else if (!state.tracker.target_detected) {
    messages.push({
      level: "warn",
      title: "Target State",
      body: `Target not locked. Mode: ${state.tracker.controller_mode}`,
    });
  } else {
    messages.push({
      level: "ok",
      title: "Tracking",
      body: `Confidence ${state.tracker.target_confidence.toFixed(2)} in ${state.tracker.controller_mode}`,
    });
  }

  if (!state.health.frame_rate_ok) {
    messages.push({
      level: "warn",
      title: "Vision Latency",
      body: `${state.health.frame_latency_ms.toFixed(1)} ms frame delay`,
    });
  }

  if (state.health.cycle_budget_warn) {
    messages.push({
      level: "warn",
      title: "Control Budget",
      body: `${state.health.control_loop_ms.toFixed(1)} ms cycle time near limit`,
    });
  }

  if (state.tracker.last_strike_completion?.completed) {
    messages.push({
      level: "warn",
      title: "Strike Completion",
      body: state.tracker.last_strike_completion.reason,
    });
  }

  vehicleMessages.innerHTML = messages
    .map(
      (item) => `
        <div class="message-item ${item.level}">
          <span>${item.title}</span>
          <strong>${item.body}</strong>
        </div>
      `
    )
    .join("");

  const watch = [
    ["FC Link", state.vehicle.link_ok ? "UP" : "DOWN"],
    ["RC Link", state.vehicle.rc_link_ok ? "UP" : "DOWN"],
    ["Video Link", state.vehicle.video_link_ok ? "UP" : "DOWN"],
    ["Storage", state.health.storage_ok ? "READY" : "FAULT"],
  ];

  linkWatch.innerHTML = watch
    .map(
      ([label, value]) => `
        <div class="watch-item">
          <span>${label}</span>
          <strong>${value}</strong>
        </div>
      `
    )
    .join("");
}

function updateButtons() {
  const buttons = Array.from(document.querySelectorAll("button[data-command]"));
  const mode = state.tracker.controller_mode;
  const armed = state.vehicle.armed;
  const enableDiveMode = Boolean(state.setup?.enable_dive_mode);
  const strikeSupported = Boolean(state.setup?.supported_modes?.includes("strike"));
  const blockers = [];
  const checklist = [];

  document.querySelector("#command-arm-state").textContent = armed ? "armed" : "disarmed";
  document.querySelector("#command-gate").textContent = state.tracker.failsafe_active ? "restricted" : "ready";
  document.querySelector("#command-arm-state").className = armed ? "warn" : "ok";
  document.querySelector("#command-gate").className = state.tracker.failsafe_active ? "danger" : "ok";

  if (!armed) {
    blockers.push("Tracking commands require armed vehicle");
  }
  checklist.push({ label: "Vehicle armed", ok: armed });
  checklist.push({ label: "Telemetry link healthy", ok: state.vehicle.link_ok && state.health.mavlink_connected });
  checklist.push({ label: "Video link available", ok: state.vehicle.video_link_ok });
  checklist.push({ label: "Target lock or search ready", ok: state.tracker.target_detected || mode === "manual" || mode === "search" });
  if (!enableDiveMode) {
    blockers.push("Dive mode disabled by setup");
  }
  if (!strikeSupported) {
    blockers.push("Strike mode not advertised by vehicle");
  }
  if (state.tracker.failsafe_active) {
    blockers.push(`Failsafe active: ${state.tracker.failsafe_reasons.join(", ") || "unknown"}`);
  }

  for (const button of buttons) {
    const command = button.dataset.command;
    const modeArg = button.dataset.mode;
    let enabled = true;

    if (command === "arm") {
      enabled = mode === "manual" && !armed;
    } else if (command === "disarm") {
      enabled = armed;
    } else if (command === "start_tracking") {
      enabled = (mode === "manual" || mode === "search") && armed;
    } else if (command === "stop_tracking") {
      enabled = mode !== "manual" && mode !== "failsafe";
    } else if (command === "reset_failsafe_latch") {
      enabled = mode === "failsafe";
    } else if (command === "set_requested_mode" && modeArg === "track_dive") {
      enabled = mode === "track_cruise" && enableDiveMode;
    } else if (command === "set_requested_mode" && modeArg === "strike") {
      enabled = strikeSupported && armed && (mode === "track_cruise" || mode === "track_dive");
    } else if (command === "set_requested_mode" && modeArg === "track_cruise") {
      enabled = mode === "track_dive" || mode === "strike";
    }

    button.disabled = !enabled;
  }

  commandBlockers.innerHTML = blockers.length
    ? blockers.map((item) => `<div class="blocker-item">${item}</div>`).join("")
    : `<div class="blocker-item ok">No command blockers</div>`;
  commandChecklist.innerHTML = checklist
    .map((item) => `<div class="check-item ${item.ok ? "ok" : "warn"}">${item.label}</div>`)
    .join("");
}

function renderSetupView() {
  const panel = document.querySelector('[data-view-panel="setup"] .placeholder-panel');
  panel.innerHTML = `
    <div class="panel-head">
      <p class="eyebrow">Setup View</p>
      <span class="mini-pill">Read Only</span>
    </div>
    <h2>Vehicle Setup Summary</h2>
    <div class="kv-grid">
      <div class="kv"><span>System</span><strong>${state.setup.system_name}</strong></div>
      <div class="kv"><span>Version</span><strong>${state.setup.system_version}</strong></div>
      <div class="kv"><span>Git Commit</span><strong>${state.setup.git_commit}</strong></div>
      <div class="kv"><span>Vehicle Type</span><strong>${state.setup.vehicle_type ?? "unknown"}</strong></div>
      <div class="kv"><span>Dive Mode</span><strong>${state.setup.enable_dive_mode ? "enabled" : "disabled"}</strong></div>
      <div class="kv"><span>Modes</span><strong>${state.setup.supported_modes.join(", ")}</strong></div>
      <div class="kv"><span>Commands</span><strong>${state.setup.supported_commands.length}</strong></div>
      <div class="kv"><span>Output Backends</span><strong>${state.setup.supported_output_backends.join(", ")}</strong></div>
      <div class="kv"><span>Log Export</span><strong>${state.setup.log_export_ready ? "ready" : "pending"}</strong></div>
    </div>
  `;
}

function renderAnalyzeView() {
  const summary = document.querySelector("#analyze-summary");
  const commandHistory = document.querySelector("#command-history");
  const timeline = document.querySelector("#event-timeline");

  renderKV(summary, [
    ["Current Mode", state.tracker.controller_mode],
    ["Requested Mode", state.tracker.requested_mode],
    ["Airframe", state.setup.vehicle_type ?? "unknown"],
    ["Event Count", state.events.length],
    ["Command Count", state.commands.length],
    ["Output Failures", state.tracker.output_failure_count],
    ["Strike Completion", state.tracker.last_strike_completion?.completed ? state.tracker.last_strike_completion.reason : "none"],
    ["Battery", state.vehicle.battery_remaining_pct, " %"],
  ]);

  commandHistory.innerHTML = state.commands.length
    ? state.commands
        .map(
          (item) => `
            <div class="event-item ${item.status === "error" ? "critical" : "info"}">
              <p>${item.command}</p>
              <div class="event-meta">
                ${item.status} · ${new Date(item.timestamp * 1000).toLocaleTimeString()} ·
                <code>${item.request_id}</code>
              </div>
            </div>
          `
        )
        .join("")
    : `<div class="event-item info"><p>No commands yet</p><div class="event-meta">Waiting for operator input</div></div>`;

  timeline.innerHTML = state.events
    .map(
      (event) => `
        <div class="timeline-item">
          <div class="timeline-time">${new Date(event.timestamp * 1000).toLocaleTimeString()}</div>
          <div class="timeline-body">
            <strong>${event.code}</strong>
            <div>
              ${event.message}
              ${event.context?.request_id ? `<br /><code>${event.context.request_id}</code>` : ""}
            </div>
          </div>
        </div>
      `
    )
    .join("");
}

function render() {
  if (!state.vehicle || !state.tracker || !state.health || !state.setup) {
    return;
  }
  initMap();
  renderKV(vehiclePanel, [
    ["Armed", state.vehicle.armed],
    ["FC Mode", state.vehicle.flight_mode_fc],
    ["Roll", state.vehicle.roll_deg, " deg"],
    ["Pitch", state.vehicle.pitch_deg, " deg"],
    ["Yaw Rate", state.vehicle.yaw_rate_dps, " dps"],
    ["Altitude AGL", state.vehicle.altitude_agl_m, " m"],
    ["Battery", state.vehicle.battery_voltage, " V"],
    ["Battery Rem", state.vehicle.battery_remaining_pct, " %"],
    ["RC Link", state.vehicle.rc_link_ok],
    ["Video Link", state.vehicle.video_link_ok],
    ["Airframe", state.setup.vehicle_type ?? "unknown"],
  ]);

  renderKV(trackerPanel, [
    ["Controller", state.tracker.controller_mode],
    ["Requested", state.tracker.requested_mode],
    ["Guidance Source", state.tracker.guidance_source ?? "unknown"],
    ["Target", state.tracker.target_detected],
    ["Confidence", state.tracker.target_confidence],
    ["Frame Age", state.tracker.frame_age_ms, " ms"],
    ["Continuity", state.tracker.continuity_score],
    ["Candidate Frames", state.tracker.candidate_frames],
    ["Abort Required", state.tracker.abort_required],
    ["Failsafe", state.tracker.failsafe_active],
    ["Reasons", state.tracker.failsafe_reasons],
    ["Output", state.tracker.output_backend],
    ["Send OK", state.tracker.output_send_ok],
    ["Output Failures", state.tracker.output_failure_count],
    ["Strike Completion", state.tracker.last_strike_completion?.completed ? state.tracker.last_strike_completion.reason : "none"],
    ["Clip Axes", state.tracker.last_envelope_clipped_axes],
  ]);

  renderKV(healthPanel, [
    ["MAVLink", state.health.mavlink_connected],
    ["MAVLink Latency", state.health.mavlink_latency_ms, " ms"],
    ["Frame Rate OK", state.health.frame_rate_ok],
    ["Frame Latency", state.health.frame_latency_ms, " ms"],
    ["Control Rate OK", state.health.control_rate_ok],
    ["Control Loop", state.health.control_loop_ms, " ms"],
    ["Cycle Budget", state.health.cycle_budget_warn ? "warn" : "ok"],
    ["Detector", state.health.detector_ok],
    ["Tracker", state.health.tracker_ok],
    ["Storage", state.health.storage_ok],
  ]);

  updateHero();
  updateOperationalCanvas();
  updateAlerts();
  updatePills();
  updateButtons();
  renderEvents();
  renderSetupView();
  renderAnalyzeView();
}

function handleEnvelope(envelope) {
  const { channel, payload } = envelope;
  if (channel === "vehicle") {
    state.vehicle = payload;
  } else if (channel === "tracker") {
    state.tracker = payload;
  } else if (channel === "health") {
    state.health = payload;
  } else if (channel === "events") {
    state.events = payload.events;
  } else if (channel === "commands") {
    state.commands = payload.commands;
  } else if (channel === "setup") {
    state.setup = payload;
  } else if (channel === "command_result") {
    commandResult.textContent = JSON.stringify(payload, null, 2);
  }
  render();
}

function updateTransportStatus(status) {
  transportPhase.textContent = status.phase;
  transportDetail.textContent = status.detail;
  transportModeLabel.textContent = runtimeConfig.transportMode;
  transportBanner.className = `transport-banner ${status.phase}`;
  if (status.phase !== "connected") {
    commandResult.textContent = status.detail;
  }
}

document.querySelectorAll("button[data-command]").forEach((button) => {
  button.addEventListener("click", () => {
    const command = button.dataset.command;
    const params = button.dataset.mode ? { mode: button.dataset.mode } : {};
    requestCommand(command, params);
  });
});

confirmCancel.addEventListener("click", () => {
  closeConfirmModal();
});

confirmCheckbox.addEventListener("change", () => {
  confirmAccept.disabled = !confirmCheckbox.checked;
});

confirmAccept.addEventListener("click", () => {
  if (pendingCommand) {
    sendCommand(pendingCommand.command, pendingCommand.params);
  }
  closeConfirmModal();
});

mapFocusTargetButton.addEventListener("click", () => {
  if (!map || !targetMarker) {
    return;
  }
  map.panTo(targetMarker.getLatLng(), { animate: true, duration: 0.6 });
});

mapRthButton.addEventListener("click", () => {
  if (!map) {
    return;
  }
  map.fitBounds([
    [37.5661, 126.9775],
    [37.5669, 126.9784],
  ], { padding: [24, 24] });
});

videoLoadButton.addEventListener("click", () => {
  loadVideoStream(videoUrlInput.value.trim());
});

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    const view = tab.dataset.view;
    tabs.forEach((item) => item.classList.toggle("is-active", item === tab));
    views.forEach((panel) => panel.classList.toggle("is-active", panel.dataset.viewPanel === view));
  });
});

dockTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    const dock = tab.dataset.dock;
    dockTabs.forEach((item) => item.classList.toggle("is-active", item === tab));
    dockPanels.forEach((panel) => panel.classList.toggle("is-active", panel.dataset.dockPanel === dock));
  });
});

transport.connect();
