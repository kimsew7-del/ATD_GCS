#!/usr/bin/env python3
"""Serve the ATD_GCS static app with a mock transport API."""

from __future__ import annotations

import json
import socket
import struct
import time
from base64 import b64encode
from copy import deepcopy
from dataclasses import dataclass, field
from hashlib import sha1
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Lock, Thread
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parent.parent
APP_DIR = ROOT / "app"
SCHEMA_VERSION = "0.1.0"
REQUEST_REQUIRED_KEYS = {"schema_version", "request_id", "command", "params", "timestamp"}
VEHICLE_REQUIRED_KEYS = {
    "schema_version",
    "timestamp",
    "sequence",
    "link_ok",
    "armed",
    "flight_mode_fc",
    "roll_deg",
    "pitch_deg",
    "yaw_rate_dps",
    "altitude_agl_m",
    "battery_voltage",
    "battery_remaining_pct",
    "rc_link_ok",
    "video_link_ok",
}
TRACKER_REQUIRED_KEYS = {
    "schema_version",
    "timestamp",
    "sequence",
    "controller_mode",
    "requested_mode",
    "target_detected",
    "target_confidence",
    "frame_age_ms",
    "target_lost_since",
    "continuity_score",
    "candidate_frames",
    "abort_required",
    "failsafe_active",
    "failsafe_reasons",
    "output_backend",
    "output_send_ok",
    "output_failure_count",
    "predicted_center_x_norm",
    "predicted_center_y_norm",
    "image_velocity_x",
    "image_velocity_y",
    "scale_rate",
    "last_envelope_clipped_axes",
    "frame_timestamp",
}
HEALTH_REQUIRED_KEYS = {
    "schema_version",
    "timestamp",
    "sequence",
    "mavlink_connected",
    "mavlink_latency_ms",
    "frame_rate_ok",
    "frame_latency_ms",
    "control_rate_ok",
    "control_loop_ms",
    "detector_ok",
    "tracker_ok",
    "storage_ok",
}
EVENT_REQUIRED_KEYS = {
    "schema_version",
    "event_id",
    "timestamp",
    "sequence",
    "severity",
    "code",
    "message",
    "context",
}
WS_MAGIC = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
COMMAND_HISTORY_REQUIRED_KEYS = {
    "sequence",
    "request_id",
    "timestamp",
    "command",
    "status",
    "result",
}


def now_ts() -> float:
    return time.time()


def require_keys(payload: dict, required: set[str], label: str) -> None:
    missing = sorted(required - payload.keys())
    if missing:
        raise ValueError(f"{label} missing keys: {', '.join(missing)}")


def validate_schema_version(value: object, label: str) -> None:
    if value != SCHEMA_VERSION:
        raise ValueError(f"{label} schema_version must be {SCHEMA_VERSION}")


def validate_command_request(payload: dict) -> None:
    require_keys(payload, REQUEST_REQUIRED_KEYS, "command_request")
    validate_schema_version(payload.get("schema_version"), "command_request")
    if not isinstance(payload.get("request_id"), str) or not payload["request_id"]:
        raise ValueError("command_request request_id must be a non-empty string")
    if not isinstance(payload.get("command"), str) or not payload["command"]:
        raise ValueError("command_request command must be a non-empty string")
    if not isinstance(payload.get("params"), dict):
        raise ValueError("command_request params must be an object")
    if not isinstance(payload.get("timestamp"), (int, float)):
        raise ValueError("command_request timestamp must be numeric")


def validate_snapshot(snapshot: dict) -> None:
    require_keys(snapshot["vehicle"], VEHICLE_REQUIRED_KEYS, "vehicle")
    require_keys(snapshot["tracker"], TRACKER_REQUIRED_KEYS, "tracker")
    require_keys(snapshot["health"], HEALTH_REQUIRED_KEYS, "health")
    for label in ("vehicle", "tracker", "health"):
        validate_schema_version(snapshot[label]["schema_version"], label)
    for event in snapshot["events"]:
        require_keys(event, EVENT_REQUIRED_KEYS, "event")
        validate_schema_version(event["schema_version"], "event")
    for command in snapshot["commands"]:
        require_keys(command, COMMAND_HISTORY_REQUIRED_KEYS, "command_history")
    validate_schema_version(snapshot["setup"]["schema_version"], "setup")


def websocket_accept(key: str) -> str:
    digest = sha1(f"{key}{WS_MAGIC}".encode("utf-8")).digest()
    return b64encode(digest).decode("ascii")


def encode_ws_frame(payload: str) -> bytes:
    data = payload.encode("utf-8")
    length = len(data)
    if length < 126:
        header = struct.pack("!BB", 0x81, length)
    elif length < 65536:
        header = struct.pack("!BBH", 0x81, 126, length)
    else:
        header = struct.pack("!BBQ", 0x81, 127, length)
    return header + data


def read_exact(sock: socket.socket, size: int) -> bytes:
    chunks = []
    remaining = size
    while remaining > 0:
        chunk = sock.recv(remaining)
        if not chunk:
            raise ConnectionError("socket closed")
        chunks.append(chunk)
        remaining -= len(chunk)
    return b"".join(chunks)


def decode_ws_frame(sock: socket.socket) -> str | None:
    header = sock.recv(2)
    if not header:
        return None
    first, second = header
    opcode = first & 0x0F
    masked = second & 0x80
    length = second & 0x7F

    if opcode == 0x8:
        return None
    if opcode != 0x1:
        raise ValueError("unsupported websocket opcode")
    if length == 126:
        length = struct.unpack("!H", read_exact(sock, 2))[0]
    elif length == 127:
        length = struct.unpack("!Q", read_exact(sock, 8))[0]
    mask = read_exact(sock, 4) if masked else b""
    payload = read_exact(sock, length)
    if masked:
        payload = bytes(byte ^ mask[index % 4] for index, byte in enumerate(payload))
    return payload.decode("utf-8")


def make_frames() -> list[dict]:
    return [
        {
            "vehicle": {
                "schema_version": "0.1.0",
                "timestamp": 1741527622.384,
                "sequence": 48201,
                "link_ok": True,
                "armed": False,
                "flight_mode_fc": "MANUAL",
                "roll_deg": 0.0,
                "pitch_deg": 0.0,
                "yaw_rate_dps": 0.0,
                "altitude_agl_m": None,
                "battery_voltage": 22.7,
                "battery_remaining_pct": 78,
                "rc_link_ok": True,
                "video_link_ok": True,
            },
            "tracker": {
                "schema_version": "0.1.0",
                "timestamp": 1741527622.404,
                "sequence": 120500,
                "controller_mode": "manual",
                "requested_mode": "manual",
                "target_detected": False,
                "target_confidence": 0.0,
                "frame_age_ms": 0.0,
                "target_lost_since": None,
                "continuity_score": 0.0,
                "candidate_frames": 0,
                "abort_required": False,
                "failsafe_active": False,
                "failsafe_reasons": [],
                "output_backend": "elrs",
                "output_send_ok": True,
                "output_failure_count": 0,
                "predicted_center_x_norm": 0.0,
                "predicted_center_y_norm": 0.0,
                "image_velocity_x": 0.0,
                "image_velocity_y": 0.0,
                "scale_rate": 0.0,
                "last_envelope_clipped_axes": [],
                "frame_timestamp": 1741527622.386,
                "guidance_source": "manual",
                "last_strike_completion": {"completed": False, "reason": None},
            },
            "health": {
                "schema_version": "0.1.0",
                "timestamp": 1741527622.500,
                "sequence": 4820,
                "mavlink_connected": True,
                "mavlink_latency_ms": 11.4,
                "frame_rate_ok": True,
                "frame_latency_ms": 22.1,
                "control_rate_ok": True,
                "control_loop_ms": 20.0,
                "cycle_budget_warn": False,
                "cycle_budget_fraction": 0.80,
                "detector_ok": True,
                "tracker_ok": True,
                "storage_ok": True,
            },
            "event": {
                "severity": "info",
                "code": "mode_changed",
                "message": "Mode changed: manual -> manual (requested)",
                "context": {"current_mode": "manual"},
            },
        },
        {
            "vehicle": {
                "schema_version": "0.1.0",
                "timestamp": 1741527623.384,
                "sequence": 48221,
                "link_ok": True,
                "armed": True,
                "flight_mode_fc": "STABILIZE",
                "roll_deg": 4.4,
                "pitch_deg": -1.2,
                "yaw_rate_dps": 5.4,
                "altitude_agl_m": 58.4,
                "battery_voltage": 22.4,
                "battery_remaining_pct": 72,
                "rc_link_ok": True,
                "video_link_ok": True,
            },
            "tracker": {
                "schema_version": "0.1.0",
                "timestamp": 1741527623.404,
                "sequence": 120502,
                "controller_mode": "track_cruise",
                "requested_mode": "track_cruise",
                "target_detected": True,
                "target_confidence": 0.87,
                "frame_age_ms": 18.3,
                "target_lost_since": None,
                "continuity_score": 0.0,
                "candidate_frames": 0,
                "abort_required": False,
                "failsafe_active": False,
                "failsafe_reasons": [],
                "output_backend": "elrs",
                "output_send_ok": True,
                "output_failure_count": 0,
                "predicted_center_x_norm": 0.12,
                "predicted_center_y_norm": -0.05,
                "image_velocity_x": 0.03,
                "image_velocity_y": -0.01,
                "scale_rate": 0.002,
                "last_envelope_clipped_axes": [],
                "frame_timestamp": 1741527623.386,
                "guidance_source": "track_cruise",
                "last_strike_completion": {"completed": False, "reason": None},
            },
            "health": {
                "schema_version": "0.1.0",
                "timestamp": 1741527623.500,
                "sequence": 4822,
                "mavlink_connected": True,
                "mavlink_latency_ms": 12.4,
                "frame_rate_ok": True,
                "frame_latency_ms": 21.4,
                "control_rate_ok": True,
                "control_loop_ms": 20.1,
                "cycle_budget_warn": False,
                "cycle_budget_fraction": 0.82,
                "detector_ok": True,
                "tracker_ok": True,
                "storage_ok": True,
            },
            "event": {
                "severity": "info",
                "code": "mode_changed",
                "message": "Mode changed: manual -> track_cruise (gcs_command)",
                "context": {"current_mode": "track_cruise"},
            },
        },
        {
            "vehicle": {
                "schema_version": "0.1.0",
                "timestamp": 1741527623.884,
                "sequence": 48231,
                "link_ok": True,
                "armed": True,
                "flight_mode_fc": "STABILIZE",
                "roll_deg": 7.8,
                "pitch_deg": -8.4,
                "yaw_rate_dps": 14.1,
                "altitude_agl_m": 39.8,
                "battery_voltage": 22.2,
                "battery_remaining_pct": 69,
                "rc_link_ok": True,
                "video_link_ok": True,
            },
            "tracker": {
                "schema_version": "0.1.0",
                "timestamp": 1741527623.904,
                "sequence": 120520,
                "controller_mode": "strike",
                "requested_mode": "strike",
                "target_detected": True,
                "target_confidence": 0.91,
                "frame_age_ms": 16.8,
                "target_lost_since": None,
                "continuity_score": 0.0,
                "candidate_frames": 0,
                "abort_required": False,
                "failsafe_active": False,
                "failsafe_reasons": [],
                "output_backend": "elrs",
                "output_send_ok": True,
                "output_failure_count": 0,
                "predicted_center_x_norm": 0.05,
                "predicted_center_y_norm": -0.18,
                "image_velocity_x": 0.04,
                "image_velocity_y": -0.03,
                "scale_rate": 0.018,
                "last_envelope_clipped_axes": [],
                "frame_timestamp": 1741527623.886,
                "guidance_source": "strike_track",
                "last_strike_completion": {"completed": False, "reason": None},
            },
            "health": {
                "schema_version": "0.1.0",
                "timestamp": 1741527624.000,
                "sequence": 4823,
                "mavlink_connected": True,
                "mavlink_latency_ms": 13.1,
                "frame_rate_ok": True,
                "frame_latency_ms": 20.8,
                "control_rate_ok": True,
                "control_loop_ms": 18.9,
                "cycle_budget_warn": False,
                "cycle_budget_fraction": 0.76,
                "detector_ok": True,
                "tracker_ok": True,
                "storage_ok": True,
            },
            "event": {
                "severity": "warning",
                "code": "mode_changed",
                "message": "Mode changed: track_cruise -> strike (gcs_command)",
                "context": {"current_mode": "strike"},
            },
        },
        {
            "vehicle": {
                "schema_version": "0.1.0",
                "timestamp": 1741527624.384,
                "sequence": 48241,
                "link_ok": True,
                "armed": True,
                "flight_mode_fc": "STABILIZE",
                "roll_deg": 12.3,
                "pitch_deg": -5.1,
                "yaw_rate_dps": 8.7,
                "altitude_agl_m": 45.2,
                "battery_voltage": 22.3,
                "battery_remaining_pct": 70,
                "rc_link_ok": True,
                "video_link_ok": True,
            },
            "tracker": {
                "schema_version": "0.1.0",
                "timestamp": 1741527624.404,
                "sequence": 120538,
                "controller_mode": "track_continuation",
                "requested_mode": "track_cruise",
                "target_detected": False,
                "target_confidence": 0.0,
                "frame_age_ms": 0.0,
                "target_lost_since": 1741527624.18,
                "continuity_score": 0.0,
                "candidate_frames": 0,
                "abort_required": False,
                "failsafe_active": False,
                "failsafe_reasons": [],
                "output_backend": "elrs",
                "output_send_ok": True,
                "output_failure_count": 0,
                "predicted_center_x_norm": 0.0,
                "predicted_center_y_norm": 0.0,
                "image_velocity_x": 0.0,
                "image_velocity_y": 0.0,
                "scale_rate": 0.0,
                "last_envelope_clipped_axes": [],
                "frame_timestamp": 1741527624.106,
                "guidance_source": "strike_path_hold",
                "last_strike_completion": {"completed": False, "reason": None},
            },
            "health": {
                "schema_version": "0.1.0",
                "timestamp": 1741527624.500,
                "sequence": 4824,
                "mavlink_connected": True,
                "mavlink_latency_ms": 15.2,
                "frame_rate_ok": False,
                "frame_latency_ms": 180.5,
                "control_rate_ok": True,
                "control_loop_ms": 20.1,
                "cycle_budget_warn": True,
                "cycle_budget_fraction": 0.93,
                "detector_ok": True,
                "tracker_ok": True,
                "storage_ok": True,
            },
            "event": {
                "severity": "warning",
                "code": "target_lost",
                "message": "Target lost during strike",
                "context": {"current_mode": "track_continuation"},
            },
        },
        {
            "vehicle": {
                "schema_version": "0.1.0",
                "timestamp": 1741527624.884,
                "sequence": 48251,
                "link_ok": True,
                "armed": True,
                "flight_mode_fc": "STABILIZE",
                "roll_deg": 1.2,
                "pitch_deg": 6.9,
                "yaw_rate_dps": 3.1,
                "altitude_agl_m": 12.4,
                "battery_voltage": 22.2,
                "battery_remaining_pct": 68,
                "rc_link_ok": True,
                "video_link_ok": True,
            },
            "tracker": {
                "schema_version": "0.1.0",
                "timestamp": 1741527624.904,
                "sequence": 120560,
                "controller_mode": "abort_recover",
                "requested_mode": "strike",
                "target_detected": False,
                "target_confidence": 0.0,
                "frame_age_ms": 0.0,
                "target_lost_since": 1741527624.18,
                "continuity_score": 0.0,
                "candidate_frames": 0,
                "abort_required": True,
                "failsafe_active": False,
                "failsafe_reasons": [],
                "output_backend": "elrs",
                "output_send_ok": True,
                "output_failure_count": 0,
                "predicted_center_x_norm": 0.0,
                "predicted_center_y_norm": 0.0,
                "image_velocity_x": 0.0,
                "image_velocity_y": 0.0,
                "scale_rate": 0.0,
                "last_envelope_clipped_axes": [],
                "frame_timestamp": 1741527624.886,
                "guidance_source": "recover",
                "last_strike_completion": {"completed": True, "reason": "target_passed"},
            },
            "health": {
                "schema_version": "0.1.0",
                "timestamp": 1741527625.000,
                "sequence": 4825,
                "mavlink_connected": True,
                "mavlink_latency_ms": 14.1,
                "frame_rate_ok": True,
                "frame_latency_ms": 18.5,
                "control_rate_ok": True,
                "control_loop_ms": 19.7,
                "cycle_budget_warn": False,
                "cycle_budget_fraction": 0.79,
                "detector_ok": True,
                "tracker_ok": True,
                "storage_ok": True,
            },
            "event": {
                "severity": "warning",
                "code": "mode_changed",
                "message": "Mode changed: strike -> abort_recover (target_passed)",
                "context": {"current_mode": "abort_recover"},
            },
        },
        {
            "vehicle": {
                "schema_version": "0.1.0",
                "timestamp": 1741527625.384,
                "sequence": 48261,
                "link_ok": True,
                "armed": True,
                "flight_mode_fc": "STABILIZE",
                "roll_deg": 0.0,
                "pitch_deg": 0.0,
                "yaw_rate_dps": 0.0,
                "altitude_agl_m": 41.7,
                "battery_voltage": 22.1,
                "battery_remaining_pct": 67,
                "rc_link_ok": True,
                "video_link_ok": True,
            },
            "tracker": {
                "schema_version": "0.1.0",
                "timestamp": 1741527625.404,
                "sequence": 120642,
                "controller_mode": "failsafe",
                "requested_mode": "track_cruise",
                "target_detected": False,
                "target_confidence": 0.0,
                "frame_age_ms": 0.0,
                "target_lost_since": 1741527624.8,
                "continuity_score": 0.0,
                "candidate_frames": 0,
                "abort_required": True,
                "failsafe_active": True,
                "failsafe_reasons": ["output_send_failed"],
                "output_backend": "elrs",
                "output_send_ok": False,
                "output_failure_count": 3,
                "predicted_center_x_norm": 0.0,
                "predicted_center_y_norm": 0.0,
                "image_velocity_x": 0.0,
                "image_velocity_y": 0.0,
                "scale_rate": 0.0,
                "last_envelope_clipped_axes": [],
                "frame_timestamp": 1741527625.186,
                "guidance_source": "failsafe",
                "last_strike_completion": {"completed": True, "reason": "target_passed"},
            },
            "health": {
                "schema_version": "0.1.0",
                "timestamp": 1741527625.500,
                "sequence": 4826,
                "mavlink_connected": True,
                "mavlink_latency_ms": 16.7,
                "frame_rate_ok": False,
                "frame_latency_ms": 182.2,
                "control_rate_ok": True,
                "control_loop_ms": 20.2,
                "cycle_budget_warn": True,
                "cycle_budget_fraction": 0.94,
                "detector_ok": True,
                "tracker_ok": True,
                "storage_ok": True,
            },
            "event": {
                "severity": "critical",
                "code": "failsafe_entered",
                "message": "Failsafe activated: output_send_failed",
                "context": {"current_mode": "failsafe"},
            },
        },
    ]


@dataclass
class MockState:
    frames: list[dict] = field(default_factory=make_frames)
    frame_index: int = 0
    event_sequence: int = 1
    last_auto_advance: float = field(default_factory=now_ts)
    setup: dict = field(
        default_factory=lambda: {
            "schema_version": "0.1.0",
            "system_name": "ATD v2 Mock Vehicle",
            "system_version": "0.1.0",
            "git_commit": "mock-local",
            "telemetry_schema_version": "0.1.0",
            "command_schema_version": "0.1.0",
            "event_schema_version": "0.1.0",
            "vehicle_type": "multicopter",
            "supported_commands": [
                "set_requested_mode",
                "start_tracking",
                "stop_tracking",
                "arm",
                "disarm",
                "reset_failsafe_latch",
            ],
            "supported_modes": ["manual", "search", "track_cruise", "track_dive", "strike"],
            "supported_output_backends": ["sim", "elrs"],
            "enable_dive_mode": True,
            "video_transport": "placeholder",
            "log_export_ready": False,
        }
    )
    events: list[dict] = field(default_factory=list)
    commands: list[dict] = field(default_factory=list)
    command_sequence: int = 1

    def __post_init__(self) -> None:
        self.events = [self._event_from_frame(self.frames[0]["event"])]

    def _stamp_payloads(self, frame: dict) -> dict:
        stamped = deepcopy(frame)
        base = now_ts()
        stamped["vehicle"]["timestamp"] = base
        stamped["tracker"]["timestamp"] = base + 0.02
        stamped["tracker"]["frame_timestamp"] = base
        stamped["health"]["timestamp"] = base + 0.1
        return stamped

    def _event_from_frame(self, event: dict) -> dict:
        payload = deepcopy(event)
        payload.update(
            {
                "schema_version": "0.1.0",
                "event_id": f"evt-{self.event_sequence:05d}",
                "timestamp": now_ts(),
                "sequence": self.event_sequence,
            }
        )
        self.event_sequence += 1
        return payload

    def _command_event(
        self,
        *,
        code: str,
        message: str,
        request_id: str,
        severity: str = "info",
        context: dict | None = None,
    ) -> dict:
        payload = {
            "severity": severity,
            "code": code,
            "message": message,
            "context": {
                "request_id": request_id,
                **(context or {}),
            },
        }
        return self._event_from_frame(payload)

    def maybe_advance(self) -> None:
        if now_ts() - self.last_auto_advance < 7.0:
            return
        self.advance()

    def advance(self) -> None:
        self.frame_index = (self.frame_index + 1) % len(self.frames)
        self.last_auto_advance = now_ts()
        self.events.insert(0, self._event_from_frame(self.frames[self.frame_index]["event"]))
        self.events = self.events[:20]

    def snapshot(self) -> dict:
        self.maybe_advance()
        frame = self._stamp_payloads(self.frames[self.frame_index])
        return {
            "vehicle": frame["vehicle"],
            "tracker": frame["tracker"],
            "health": frame["health"],
            "events": self.events[:8],
            "commands": self.commands[:8],
            "setup": self.setup,
        }

    def command(self, payload: dict) -> dict:
        command = payload.get("command")
        params = payload.get("params", {})
        request_id = payload.get("request_id", f"mock-{int(now_ts() * 1000)}")
        frame = deepcopy(self.frames[self.frame_index])

        if command == "toggle_mock":
            self.advance()
            self.events.insert(
                0,
                self._command_event(
                    code="command_completed",
                    message="Mock frame advanced",
                    request_id=request_id,
                    context={"command": command},
                ),
            )
            return self._record_command(command, {"advanced": True}, request_id=request_id)

        if command == "arm":
            frame["vehicle"]["armed"] = True
            frame["vehicle"]["flight_mode_fc"] = "STABILIZE"
            self.frames[self.frame_index] = frame
            self.events.insert(
                0,
                self._command_event(
                    code="command_completed",
                    message="Arm command accepted",
                    request_id=request_id,
                    context={"command": command},
                ),
            )
            return self._record_command(command, {"armed": True}, request_id=request_id)

        if command == "disarm":
            frame["vehicle"]["armed"] = False
            frame["vehicle"]["flight_mode_fc"] = "MANUAL"
            frame["tracker"]["guidance_source"] = "manual"
            self.frames[self.frame_index] = frame
            self.events.insert(
                0,
                self._command_event(
                    code="command_completed",
                    message="Disarm command accepted",
                    request_id=request_id,
                    context={"command": command},
                ),
            )
            return self._record_command(command, {"armed": False}, request_id=request_id)

        if command == "start_tracking":
            if not frame["vehicle"]["armed"]:
                return self._error(payload, "not_armed", "Vehicle must be armed before tracking")
            frame["tracker"]["requested_mode"] = "track_cruise"
            frame["tracker"]["controller_mode"] = "track_cruise"
            frame["tracker"]["target_detected"] = True
            frame["tracker"]["target_confidence"] = 0.87
            frame["tracker"]["guidance_source"] = "track_cruise"
            frame["tracker"]["last_strike_completion"] = {"completed": False, "reason": None}
            self.frames[self.frame_index] = frame
            self.events.insert(
                0,
                self._event_from_frame(
                    {
                        "severity": "info",
                        "code": "mode_changed",
                        "message": "Mode changed: manual -> track_cruise (gcs_command)",
                        "context": {"current_mode": "track_cruise", "request_id": request_id},
                    }
                ),
            )
            self.events.insert(
                0,
                self._command_event(
                    code="command_completed",
                    message="Start tracking accepted",
                    request_id=request_id,
                    context={"command": command, "effective_mode": "track_cruise"},
                ),
            )
            return self._record_command(command, {"effective_mode": "track_cruise"}, request_id=request_id)

        if command == "stop_tracking":
            frame["tracker"]["requested_mode"] = "manual"
            frame["tracker"]["controller_mode"] = "manual"
            frame["tracker"]["target_detected"] = False
            frame["tracker"]["guidance_source"] = "manual"
            self.frames[self.frame_index] = frame
            self.events.insert(
                0,
                self._event_from_frame(
                    {
                        "severity": "info",
                        "code": "mode_changed",
                        "message": "Mode changed: track -> manual (gcs_command)",
                        "context": {"current_mode": "manual", "request_id": request_id},
                    }
                ),
            )
            self.events.insert(
                0,
                self._command_event(
                    code="command_completed",
                    message="Stop tracking accepted",
                    request_id=request_id,
                    context={"command": command, "effective_mode": "manual"},
                ),
            )
            return self._record_command(command, {"effective_mode": "manual"}, request_id=request_id)

        if command == "set_requested_mode":
            mode = params.get("mode")
            if mode not in {"manual", "search", "track_cruise", "track_dive", "strike"}:
                return self._error(payload, "invalid_mode", f"Unsupported mode: {mode}")
            effective = mode
            if mode == "track_dive" and not self.setup["enable_dive_mode"]:
                effective = "track_cruise"
            frame["tracker"]["requested_mode"] = mode
            frame["tracker"]["controller_mode"] = effective
            if effective == "manual":
                frame["tracker"]["guidance_source"] = "manual"
            elif effective == "strike":
                frame["tracker"]["guidance_source"] = "strike_track"
                frame["tracker"]["last_strike_completion"] = {"completed": False, "reason": None}
            else:
                frame["tracker"]["guidance_source"] = effective
            self.frames[self.frame_index] = frame
            self.events.insert(
                0,
                self._event_from_frame(
                    {
                        "severity": "info",
                        "code": "mode_changed",
                        "message": f"Mode changed via GCS: {effective}",
                        "context": {"current_mode": effective, "request_id": request_id},
                    }
                ),
            )
            self.events.insert(
                0,
                self._command_event(
                    code="command_completed",
                    message=f"Mode request accepted: {effective}",
                    request_id=request_id,
                    context={"command": command, "accepted_mode": mode, "effective_mode": effective},
                ),
            )
            return self._record_command(
                command,
                {"accepted_mode": mode, "effective_mode": effective},
                request_id=request_id,
            )

        if command == "reset_failsafe_latch":
            frame["tracker"]["failsafe_active"] = False
            frame["tracker"]["failsafe_reasons"] = []
            frame["tracker"]["controller_mode"] = "manual"
            frame["tracker"]["requested_mode"] = "manual"
            frame["tracker"]["output_send_ok"] = True
            frame["tracker"]["output_failure_count"] = 0
            frame["tracker"]["guidance_source"] = "manual"
            self.frames[self.frame_index] = frame
            self.events.insert(
                0,
                self._event_from_frame(
                    {
                        "severity": "info",
                        "code": "failsafe_cleared",
                        "message": "Failsafe cleared, returning to manual",
                        "context": {"effective_mode": "manual", "request_id": request_id},
                    }
                ),
            )
            self.events.insert(
                0,
                self._command_event(
                    code="command_completed",
                    message="Failsafe reset accepted",
                    request_id=request_id,
                    context={"command": command, "effective_mode": "manual"},
                ),
            )
            return self._record_command(command, {"effective_mode": "manual"}, request_id=request_id)

        return self._error(payload, "unknown_command", f"Unknown command: {command}")

    def _result(self, command: str, result: dict) -> dict:
        return {
            "schema_version": SCHEMA_VERSION,
            "request_id": f"mock-{int(now_ts() * 1000)}",
            "status": "ok",
            "command": command,
            "result": result,
            "error": None,
            "timestamp": now_ts(),
        }

    def _record_command(self, command: str, result: dict, *, request_id: str) -> dict:
        payload = self._result(command, result)
        payload["request_id"] = request_id
        self.commands.insert(
            0,
            {
                "sequence": self.command_sequence,
                "request_id": request_id,
                "timestamp": payload["timestamp"],
                "command": command,
                "status": payload["status"],
                "result": result,
            },
        )
        self.command_sequence += 1
        self.commands = self.commands[:20]
        return payload

    def _error(self, payload: dict, code: str, message: str) -> dict:
        error_payload = {
            "schema_version": SCHEMA_VERSION,
            "request_id": payload.get("request_id", f"mock-{int(now_ts() * 1000)}"),
            "status": "error",
            "result": None,
            "error": {"code": code, "message": message},
            "timestamp": now_ts(),
        }
        request_id = error_payload["request_id"]
        self.commands.insert(
            0,
            {
                "sequence": self.command_sequence,
                "request_id": request_id,
                "timestamp": error_payload["timestamp"],
                "command": payload.get("command", "unknown"),
                "status": "error",
                "result": error_payload["error"],
            },
        )
        self.command_sequence += 1
        self.events.insert(
            0,
            self._command_event(
                code="command_failed",
                message=message,
                request_id=request_id,
                severity="warning",
                context={"command": payload.get("command", "unknown"), "error_code": code},
            ),
        )
        self.commands = self.commands[:20]
        return error_payload


MOCK = MockState()
CLIENTS: set["WebSocketClient"] = set()
CLIENTS_LOCK = Lock()


@dataclass(eq=False)
class WebSocketClient:
    socket: socket.socket
    lock: Lock = field(default_factory=Lock)

    def send(self, payload: dict) -> None:
        message = encode_ws_frame(json.dumps(payload))
        with self.lock:
            self.socket.sendall(message)

    def close(self) -> None:
        with self.lock:
            try:
                self.socket.close()
            except OSError:
                pass


def broadcast_snapshot() -> None:
    snapshot = MOCK.snapshot()
    validate_snapshot(snapshot)
    envelopes = [
        {"channel": "vehicle", "payload": snapshot["vehicle"]},
        {"channel": "tracker", "payload": snapshot["tracker"]},
        {"channel": "health", "payload": snapshot["health"]},
        {"channel": "events", "payload": {"schema_version": SCHEMA_VERSION, "events": snapshot["events"]}},
        {"channel": "commands", "payload": {"schema_version": SCHEMA_VERSION, "commands": snapshot["commands"]}},
        {"channel": "setup", "payload": snapshot["setup"]},
    ]
    with CLIENTS_LOCK:
        clients = list(CLIENTS)
    dead = []
    for client in clients:
        try:
            for envelope in envelopes:
                client.send(envelope)
        except OSError:
            dead.append(client)
    if dead:
        with CLIENTS_LOCK:
            for client in dead:
                CLIENTS.discard(client)
        for client in dead:
            client.close()


def broadcaster_loop() -> None:
    while True:
        time.sleep(1.5)
        broadcast_snapshot()


class AppHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(APP_DIR), **kwargs)

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path == "/ws/mock" and self.headers.get("Upgrade", "").lower() == "websocket":
            self._handle_websocket()
            return
        if parsed.path == "/api/mock/state":
            snapshot = MOCK.snapshot()
            validate_snapshot(snapshot)
            self._send_json(snapshot)
            return
        if parsed.path == "/api/mock/telemetry/vehicle":
            snapshot = MOCK.snapshot()
            validate_snapshot(snapshot)
            self._send_json(snapshot["vehicle"])
            return
        if parsed.path == "/api/mock/telemetry/tracker":
            snapshot = MOCK.snapshot()
            validate_snapshot(snapshot)
            self._send_json(snapshot["tracker"])
            return
        if parsed.path == "/api/mock/telemetry/health":
            snapshot = MOCK.snapshot()
            validate_snapshot(snapshot)
            self._send_json(snapshot["health"])
            return
        if parsed.path == "/api/mock/events":
            snapshot = MOCK.snapshot()
            validate_snapshot(snapshot)
            self._send_json({"schema_version": SCHEMA_VERSION, "events": snapshot["events"]})
            return
        if parsed.path == "/api/mock/commands":
            snapshot = MOCK.snapshot()
            validate_snapshot(snapshot)
            self._send_json({"schema_version": SCHEMA_VERSION, "commands": snapshot["commands"]})
            return
        if parsed.path == "/api/mock/advance":
            MOCK.advance()
            self._send_json({"ok": True, "frame_index": MOCK.frame_index})
            return
        if parsed.path == "/api/mock/setup":
            self._send_json(MOCK.setup)
            return
        super().do_GET()

    def do_POST(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path != "/api/mock/command":
            self.send_error(HTTPStatus.NOT_FOUND, "Unknown endpoint")
            return

        content_length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(content_length or 0)
        try:
            payload = json.loads(raw or "{}")
            validate_command_request(payload)
        except json.JSONDecodeError:
            self._send_json(
                {
                    "schema_version": SCHEMA_VERSION,
                    "status": "error",
                    "result": None,
                    "error": {"code": "invalid_request", "message": "Invalid JSON body"},
                    "timestamp": now_ts(),
                },
                status=HTTPStatus.BAD_REQUEST,
            )
            return
        except ValueError as exc:
            self._send_json(
                {
                    "schema_version": SCHEMA_VERSION,
                    "request_id": payload.get("request_id") if isinstance(payload, dict) else None,
                    "status": "error",
                    "result": None,
                    "error": {"code": "invalid_request", "message": str(exc)},
                    "timestamp": now_ts(),
                },
                status=HTTPStatus.BAD_REQUEST,
            )
            return

        self._send_json(MOCK.command(payload))

    def log_message(self, format: str, *args) -> None:
        return

    def _send_json(self, payload: dict, *, status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _handle_websocket(self) -> None:
        key = self.headers.get("Sec-WebSocket-Key")
        if not key:
            self.send_error(HTTPStatus.BAD_REQUEST, "Missing Sec-WebSocket-Key")
            return

        accept = websocket_accept(key)
        self.send_response(HTTPStatus.SWITCHING_PROTOCOLS)
        self.send_header("Upgrade", "websocket")
        self.send_header("Connection", "Upgrade")
        self.send_header("Sec-WebSocket-Accept", accept)
        self.end_headers()

        client = WebSocketClient(self.request)
        with CLIENTS_LOCK:
            CLIENTS.add(client)

        try:
            broadcast_snapshot()
            self.request.settimeout(1.0)
            while True:
                try:
                    message = decode_ws_frame(self.request)
                except socket.timeout:
                    continue
                except OSError:
                    break
                if message is None:
                    break
                self._handle_ws_message(client, message)
        finally:
            with CLIENTS_LOCK:
                CLIENTS.discard(client)
            client.close()

    def _handle_ws_message(self, client: WebSocketClient, raw_message: str) -> None:
        try:
            payload = json.loads(raw_message)
            validate_command_request(payload)
        except (json.JSONDecodeError, ValueError) as exc:
            client.send(
                {
                    "channel": "command_result",
                    "payload": {
                        "schema_version": SCHEMA_VERSION,
                        "request_id": None,
                        "status": "error",
                        "result": None,
                        "error": {"code": "invalid_request", "message": str(exc)},
                        "timestamp": now_ts(),
                    },
                }
            )
            return

        result = MOCK.command(payload)
        client.send({"channel": "command_result", "payload": result})
        broadcast_snapshot()


def main() -> None:
    host = "127.0.0.1"
    port = 8080
    server = ThreadingHTTPServer((host, port), AppHandler)
    Thread(target=broadcaster_loop, daemon=True).start()
    print(f"ATD_GCS serving on http://{host}:{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
