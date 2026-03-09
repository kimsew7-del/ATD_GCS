# ATD v2 텔레메트리 샘플 Payload

**작성일**: 2026-03-09
**스키마 버전**: `0.1.0`
**대상 문서**: `gcs-followup-request.md` 1절

---

## 공통 규칙

- 모든 메시지에 `schema_version`, `timestamp`, `sequence` 포함
- `timestamp`: UTC epoch seconds (float, `time.time()` 기준)
- `sequence`: 채널별 단조 증가 정수 (uint64)
- nullable 필드는 `null`로 표기
- 단위는 필드명 접미사로 표현 (`_deg`, `_ms`, `_dps`, `_m`, `_pct`, `_norm`)

---

## 1. Vehicle Telemetry

**채널**: `/ws/telemetry/vehicle`
**갱신 주기**: 20 Hz 목표

### 샘플 payload

```json
{
  "schema_version": "0.1.0",
  "timestamp": 1741527622.384,
  "sequence": 48201,
  "link_ok": true,
  "armed": true,
  "flight_mode_fc": "STABILIZE",
  "roll_deg": 12.3,
  "pitch_deg": -5.1,
  "yaw_rate_dps": 8.7,
  "altitude_agl_m": 45.2,
  "battery_voltage": 22.4,
  "battery_remaining_pct": 72,
  "rc_link_ok": true,
  "video_link_ok": true
}
```

### 필드 명세

| 필드 | 타입 | 단위 | nullable | 비고 |
|------|------|------|----------|------|
| `schema_version` | string | — | no | semver |
| `timestamp` | float | epoch sec | no | UTC wall-clock |
| `sequence` | int | — | no | 채널별 단조 증가 |
| `link_ok` | bool | — | no | FC 통신 상태 |
| `armed` | bool | — | no | FC arm 상태 |
| `flight_mode_fc` | string | — | no | FC 보고 비행 모드 (예: `"STABILIZE"`, `"MANUAL"`, `"FBWA"`) |
| `roll_deg` | float | degrees | no | -180 ~ +180 |
| `pitch_deg` | float | degrees | no | -90 ~ +90 |
| `yaw_rate_dps` | float | deg/s | no | |
| `altitude_agl_m` | float\|null | meters | **yes** | GPS-denied 환경에서 null 가능. rangefinder 또는 baro 기반 |
| `battery_voltage` | float\|null | volts | **yes** | FC 미연동 시 null |
| `battery_remaining_pct` | int\|null | percent | **yes** | 0~100, FC 미연동 시 null |
| `rc_link_ok` | bool | — | no | RC 수신기 링크 상태 |
| `video_link_ok` | bool | — | no | 비전 입력 수신 상태 |

### nullable 정책

GPS-denied 설계이므로 `altitude_agl_m`은 센서 가용성에 따라 null이 될 수 있다. GCS는 null일 때 "고도 불명" 표시를 해야 한다. `battery_*` 필드는 FC MAVLink 연동 전까지 null이다.

---

## 2. Tracker Telemetry

**채널**: `/ws/telemetry/tracker`
**갱신 주기**: 50 Hz (제어 루프 동기)

### 샘플 payload — 정상 추적 중

```json
{
  "schema_version": "0.1.0",
  "timestamp": 1741527622.404,
  "sequence": 120502,
  "controller_mode": "track_cruise",
  "requested_mode": "track_cruise",
  "target_detected": true,
  "target_confidence": 0.87,
  "frame_age_ms": 18.3,
  "target_lost_since": null,
  "continuity_score": 0.0,
  "candidate_frames": 0,
  "abort_required": false,
  "failsafe_active": false,
  "failsafe_reasons": [],
  "output_backend": "elrs",
  "output_send_ok": true,
  "output_failure_count": 0,
  "predicted_center_x_norm": 0.12,
  "predicted_center_y_norm": -0.05,
  "image_velocity_x": 0.03,
  "image_velocity_y": -0.01,
  "scale_rate": 0.002,
  "last_envelope_clipped_axes": [],
  "frame_timestamp": 1741527622.386
}
```

### 샘플 payload — 타겟 상실 continuation 중

```json
{
  "schema_version": "0.1.0",
  "timestamp": 1741527623.124,
  "sequence": 120538,
  "controller_mode": "track_continuation",
  "requested_mode": "track_cruise",
  "target_detected": false,
  "target_confidence": 0.0,
  "frame_age_ms": 0.0,
  "target_lost_since": 1741527622.980,
  "continuity_score": 0.0,
  "candidate_frames": 0,
  "abort_required": false,
  "failsafe_active": false,
  "failsafe_reasons": [],
  "output_backend": "elrs",
  "output_send_ok": true,
  "output_failure_count": 0,
  "predicted_center_x_norm": 0.0,
  "predicted_center_y_norm": 0.0,
  "image_velocity_x": 0.0,
  "image_velocity_y": 0.0,
  "scale_rate": 0.0,
  "last_envelope_clipped_axes": [],
  "frame_timestamp": 1741527623.106
}
```

### 샘플 payload — failsafe 진입

```json
{
  "schema_version": "0.1.0",
  "timestamp": 1741527625.204,
  "sequence": 120642,
  "controller_mode": "failsafe",
  "requested_mode": "track_cruise",
  "target_detected": false,
  "target_confidence": 0.0,
  "frame_age_ms": 0.0,
  "target_lost_since": 1741527624.800,
  "continuity_score": 0.0,
  "candidate_frames": 0,
  "abort_required": true,
  "failsafe_active": true,
  "failsafe_reasons": ["output_send_failed"],
  "output_backend": "elrs",
  "output_send_ok": false,
  "output_failure_count": 3,
  "predicted_center_x_norm": 0.0,
  "predicted_center_y_norm": 0.0,
  "image_velocity_x": 0.0,
  "image_velocity_y": 0.0,
  "scale_rate": 0.0,
  "last_envelope_clipped_axes": [],
  "frame_timestamp": 1741527625.186
}
```

### 필드 명세

| 필드 | 타입 | 단위 | nullable | 비고 |
|------|------|------|----------|------|
| `schema_version` | string | — | no | |
| `timestamp` | float | epoch sec | no | |
| `sequence` | int | — | no | |
| `controller_mode` | string | — | no | `ControlModeV2` enum 값 |
| `requested_mode` | string | — | no | 외부에서 요청한 모드 |
| `target_detected` | bool | — | no | |
| `target_confidence` | float | 0.0~1.0 | no | 미감지 시 0.0 |
| `frame_age_ms` | float | ms | no | 프레임 수신~처리 지연 |
| `target_lost_since` | float\|null | epoch sec | **yes** | 추적 중이면 null |
| `continuity_score` | float | 0.0~1.0 | no | reacquire 시에만 유효 |
| `candidate_frames` | int | — | no | switch verify 누적 프레임 |
| `abort_required` | bool | — | no | |
| `failsafe_active` | bool | — | no | `controller_mode == "failsafe"` |
| `failsafe_reasons` | string[] | — | no | 빈 배열 가능 |
| `output_backend` | string | — | no | `"sim"` 또는 `"elrs"` |
| `output_send_ok` | bool | — | no | |
| `output_failure_count` | int | — | no | |
| `predicted_center_x_norm` | float | -1.0~1.0 | no | 이미지 정규화 좌표 |
| `predicted_center_y_norm` | float | -1.0~1.0 | no | |
| `image_velocity_x` | float | norm/s | no | |
| `image_velocity_y` | float | norm/s | no | |
| `scale_rate` | float | norm/s | no | bbox 면적 변화율 |
| `last_envelope_clipped_axes` | string[] | — | no | 예: `["roll", "pitch"]` |
| `frame_timestamp` | float | epoch sec | no | 원본 프레임 캡처 시각 |

---

## 3. Health Telemetry

**채널**: `/ws/telemetry/health`
**갱신 주기**: 2 Hz

### 샘플 payload — 정상

```json
{
  "schema_version": "0.1.0",
  "timestamp": 1741527622.500,
  "sequence": 4820,
  "mavlink_connected": true,
  "mavlink_latency_ms": 12.4,
  "frame_rate_ok": true,
  "frame_latency_ms": 22.1,
  "control_rate_ok": true,
  "control_loop_ms": 20.0,
  "detector_ok": true,
  "tracker_ok": true,
  "storage_ok": true
}
```

### 샘플 payload — 비전 지연 경고

```json
{
  "schema_version": "0.1.0",
  "timestamp": 1741527630.500,
  "sequence": 4836,
  "mavlink_connected": true,
  "mavlink_latency_ms": 15.2,
  "frame_rate_ok": false,
  "frame_latency_ms": 180.5,
  "control_rate_ok": true,
  "control_loop_ms": 20.1,
  "detector_ok": true,
  "tracker_ok": true,
  "storage_ok": true
}
```

### 필드 명세

| 필드 | 타입 | 단위 | nullable | 비고 |
|------|------|------|----------|------|
| `schema_version` | string | — | no | |
| `timestamp` | float | epoch sec | no | |
| `sequence` | int | — | no | |
| `mavlink_connected` | bool | — | no | FC 통신 연결 여부 |
| `mavlink_latency_ms` | float | ms | no | 미연결 시 0.0 |
| `frame_rate_ok` | bool | — | no | 비전 입력 주기 정상 여부 |
| `frame_latency_ms` | float | ms | no | 최근 프레임 수신 지연 |
| `control_rate_ok` | bool | — | no | 제어 루프 주기 정상 여부 |
| `control_loop_ms` | float | ms | no | 최근 제어 사이클 소요 시간 |
| `detector_ok` | bool | — | no | 객체 감지 모듈 정상 여부 |
| `tracker_ok` | bool | — | no | 객체 추적 모듈 정상 여부 |
| `storage_ok` | bool | — | no | 로그 저장 공간 정상 여부 |
