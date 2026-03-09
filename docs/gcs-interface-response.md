# ATD v2 → GCS 연동 요구사항 회신

**작성일**: 2026-03-09
**작성자**: ATD v2 드론 시스템 개발팀
**대상 문서**: `drone-system-requirements-for-gcs.md`

---

## 총평

요구사항 문서의 구조와 우선순위 분류에 동의한다.
현재 v2 코드는 제어 파이프라인 내부 구조에 집중되어 있으며, GCS가 붙을 외부 인터페이스 레이어는 아직 없다.

아래 회신은 각 항목에 대해 **현재 상태**, **제공 가능 시점**, **제안 방식**을 정리한 것이다.

---

## 회신 항목

### 1. 외부 텔레메트리 인터페이스를 무엇으로 제공할 것인지

**제안: WebSocket (JSON)**

- 텔레메트리 스트림은 **WebSocket** 기반 JSON push로 제공한다.
- 채널은 두 개로 분리한다:
  - `/ws/telemetry/vehicle` — FC 기반 차량 상태 (1.1절 필드), 목표 20Hz
  - `/ws/telemetry/tracker` — 추적 제어기 상태 (1.2절 필드), 목표 50Hz (제어 루프 동기)
- Health 텔레메트리(1.3절)는 tracker 채널에 포함하거나, 저빈도(2Hz) 별도 채널 `/ws/telemetry/health`로 분리한다.
- 메시지 포맷은 JSON으로 시작하고, 성능 병목 확인 후 protobuf 전환을 검토한다.

**현재 상태**: 미구현. `RuntimeState`와 `TrackingContext`에 해당 데이터가 내부적으로 존재하지만 외부 노출 경로가 없다.

**제공 가능 시점**: P0 항목이므로 GCS 초기 개발 착수 전까지 텔레메트리 서버 스켈레톤과 샘플 payload를 제공한다.

**1.1 Vehicle Telemetry 필드별 현황:**

| 필드 | 현재 상태 | 비고 |
|------|-----------|------|
| `timestamp` | ✅ 있음 | `VehicleState.timestamp` |
| `link_ok` | ✅ 있음 | `VehicleState.link_ok` |
| `armed` | ❌ 없음 | FC 연동 시 MAVLink HEARTBEAT에서 추출 필요 |
| `flight_mode_fc` | ❌ 없음 | 동일 |
| `roll_deg` / `pitch_deg` | ✅ 있음 | `VehicleState` |
| `yaw_rate_dps` | ✅ 있음 | `VehicleState` |
| `throttle_input` | ❌ 없음 | pilot RC 입력값 노출 경로 없음 |
| `altitude_agl_m` | ⚠️ Optional | `VehicleState.altitude_agl_m` (None 가능) |
| `battery_voltage` / `remaining_pct` | ❌ 없음 | FC 텔레메트리 확장 필요 |
| `gps_fix_type` | ❌ 없음 | GPS-denied 설계이나 GCS 표시용으로 추가 가능 |
| `rc_link_ok` / `video_link_ok` | ❌ 없음 | Health monitor 확장 필요 |

→ FC 상태 필드 다수가 현재 `VehicleState`에 없다. MAVLink 텔레메트리 수신 모듈(`comm/mavlink_interface.py`)을 V2 파이프라인에 통합하고 `VehicleState`를 확장해야 한다.

**1.2 Tracker Telemetry 필드별 현황:**

| 필드 | 현재 상태 | 비고 |
|------|-----------|------|
| `controller_mode` | ✅ 있음 | `RuntimeState.current_mode` |
| `requested_mode` | ✅ 있음 | `step()` 인자로 전달됨, state에 기록 추가 필요 |
| `target_detected` | ✅ 있음 | `ImageTargetMeasurement.detected` |
| `target_confidence` | ✅ 있음 | `ImageTargetMeasurement.confidence` |
| `frame_age_ms` | ✅ 있음 | `ImageTargetMeasurement.frame_age_ms` |
| `target_lost_since` | ✅ 있음 | `RuntimeState.target_lost_since` |
| `continuity_score` | ✅ 있음 | `RuntimeState.last_continuity_score` |
| `candidate_frames` | ✅ 있음 | `RuntimeState.candidate_frames` |
| `abort_required` | ✅ 있음 | `EnvelopeResult.abort_required` |
| `failsafe_active` | ✅ 있음 | `current_mode == FAILSAFE` |
| `failsafe_reasons[]` | ✅ 있음 | `TrackingContext.failsafe_reasons` |
| `output_backend` | ✅ 있음 | `OutputSendResult.backend` |
| `output_send_ok` | ✅ 있음 | `OutputSendResult.success` |
| `output_failure_count` | ✅ 있음 | `RuntimeState.output_failure_count` |

→ Tracker 텔레메트리는 대부분 내부에 존재. 직렬화 레이어만 추가하면 된다.

---

### 2. 외부 명령 인터페이스를 무엇으로 제공할 것인지

**제안: WebSocket RPC (JSON, request-response)**

- 텔레메트리와 같은 WebSocket 연결 위에 RPC 패턴을 올린다.
- 모든 명령은 `{ request_id, command, params }` → `{ request_id, status, result, error }` 형태.
- 비동기 명령은 `accepted` → polling 또는 이벤트 push로 완료 통지.

**2.1 운용 명령 현황:**

| 명령 | 현재 상태 | 비고 |
|------|-----------|------|
| `set_requested_mode` | ⚠️ 부분 | 파이프라인 `step()`의 인자로 mode 전달 가능. 외부 API 없음 |
| `set_manual_override` / `clear` | ⚠️ 부분 | `PilotArbitration`이 스틱 입력 기반으로 판단. GCS 명령으로의 강제 override 경로 없음 |
| `start_tracking` / `stop_tracking` | ❌ 없음 | mode 전환으로 대체 가능 (`TRACK_CRUISE` ↔ `MANUAL`) |
| `reset_failsafe_latch` | ❌ 없음 | failsafe 해제 경로 미구현 |
| `arm` / `disarm` | ❌ 없음 | FC 명령 중계. MAVLink 연동 필요 |
| `acknowledge_alert` | ❌ 없음 | 이벤트/알림 시스템 자체가 없음 |

**2.2~2.3 세션/설정 명령**: 전부 미구현. 세션 관리, 설정 staging/rollback 개념이 현재 코드에 없다.

**제공 시점**: 운용 명령(2.1)은 텔레메트리 서버와 함께 우선 제공. 세션/설정 명령(2.2~2.3)은 P1 단계에서 제공한다.

---

### 3. v2 상태 머신을 외부 계약으로 고정할 수 있는지

**가능하다.**

현재 `ControlModeV2` enum이 9개 상태를 정의하고 있으며, 이 목록을 외부 계약으로 고정한다:

```
MANUAL, SEARCH, TRACK_CRUISE, TRACK_DIVE, TRACK_CONTINUATION,
REACQUIRE, TARGET_SWITCH_VERIFY, ABORT_RECOVER, FAILSAFE
```

**전이 조건 문서화 현황:**

- `ModeManager.decide()`에 모든 전이 로직이 집중되어 있어 추출 가능
- 현재 코드 기준 전이 규칙:
  - `FAILSAFE`: failsafe_reasons 존재 시 **무조건 진입** (최우선)
  - `MANUAL`: pilot 전 축 override 시 진입
  - `TRACK_CRUISE → TRACK_CONTINUATION`: target confidence ≤ 0
  - `TRACK_CONTINUATION → ABORT_RECOVER`: blind_time 초과
  - `TRACK_CONTINUATION → REACQUIRE`: target 재감지
  - `REACQUIRE → TRACK_CRUISE/DIVE`: same_target 판정
  - `REACQUIRE → TARGET_SWITCH_VERIFY`: switch_candidate 판정
  - `TARGET_SWITCH_VERIFY → TRACK_CRUISE`: candidate_frames ≥ threshold
  - `TRACK_DIVE`: enable_dive_mode=false일 때 TRACK_CRUISE로 fallback

**추가 필요 작업:**
- 상태 전이 시 이벤트 코드 발행 (`mode_changed` 이벤트)
- 전이 조건을 별도 명세 문서로 추출 (코드에서 자동 생성 권장)

---

### 4. FC telemetry와 controller telemetry를 분리해서 줄 수 있는지

**가능하다.**

현재 구조에서 이미 분리되어 있다:

- **FC 텔레메트리**: `VehicleState` — 비행제어기에서 수신하는 자세/고도/링크 정보
- **Controller 텔레메트리**: `RuntimeState` + `TrackingContext` — 추적 제어기 내부 상태

GCS에는 두 개의 별도 메시지 타입으로 전달한다. 단, 현재 `VehicleState`에 FC 필드(armed, flight_mode, battery 등)가 부족하므로 확장이 필요하다.

---

### 5. failsafe 이유 코드를 어떤 목록으로 고정할 것인지

**아래 목록을 초기 계약으로 제안한다:**

| 코드 | 설명 | 현재 구현 |
|------|------|-----------|
| `output_send_failed` | ELRS/출력 백엔드 전송 실패 | ✅ 있음 |
| `blind_timeout` | 타겟 상실 후 blind 시간 초과 | ✅ 있음 (ABORT_RECOVER 전이) |
| `low_altitude_margin` | 저고도 안전 마진 위반 | ✅ 있음 (safety_envelope) |
| `continuation_bank_limit` | continuation 중 bank 한계 초과 | ✅ 있음 (safety_envelope) |
| `reacquire_abort` | 재획득 정책에서 abort 판정 | ✅ 있음 (mode_manager) |
| `switch_abort` | 타겟 전환 중 abort 판정 | ✅ 있음 (mode_manager) |
| `mavlink_heartbeat_lost` | FC 통신 두절 | ❌ 미구현 |
| `video_frame_timeout` | 비전 입력 중단 | ❌ 미구현 |
| `detector_failure` | 객체 감지 모듈 오류 | ❌ 미구현 |
| `rc_link_lost` | RC 링크 두절 | ❌ 미구현 |

→ 현재 `failsafe_reasons`는 자유 문자열 tuple이다. 위 코드를 Enum으로 고정하고, GCS에는 이 enum 값 목록으로 전달한다.

---

### 6. 비디오 스트림과 추적 메타데이터를 어떻게 동기화할 것인지

**제안: 프레임 타임스탬프 기반 정렬**

- 비디오 스트림은 RTSP 또는 WebRTC로 별도 전달한다.
- 추적 메타데이터(bbox, confidence, target_id)는 텔레메트리 채널에 포함하되, 각 메시지에 `frame_timestamp`를 넣는다.
- GCS에서 비디오 프레임의 PTS와 메타데이터의 `frame_timestamp`를 매칭하여 오버레이한다.

**현재 상태:**
- `ImageTargetMeasurement.timestamp`로 프레임 시간 추적 가능
- `frame_age_ms`로 비전 파이프라인 지연 측정 가능
- 비디오 스트리밍 서버 자체는 미구현

**제공 시점**: P1. 초도 운용 전에 비디오 스트림 + 메타데이터 동기화 방식을 확정한다.

---

### 7. 세션 로그를 어떤 포맷으로 저장하고 내보낼 것인지

**제안: JSONL (JSON Lines) + 세션 메타데이터**

```
logs/
  session_20260309_143022/
    meta.json          # 세션 시작/종료 시간, config snapshot, 시스템 버전
    telemetry.jsonl    # 매 사이클 상태 기록 (타임스탬프 포함)
    events.jsonl       # 상태 전이, failsafe, override 등 이벤트
    commands.jsonl     # 수신 명령 및 응답 기록
```

- 각 줄이 독립 JSON 객체이므로 스트리밍 쓰기와 부분 읽기가 가능하다.
- replay 시 `telemetry.jsonl`을 타임스탬프 순으로 재생하면 된다.
- 비디오 녹화는 별도 파일(MP4)로 저장하고, `meta.json`에 비디오 파일 경로와 시작 타임스탬프를 기록하여 동기화한다.

**현재 상태**: 전혀 미구현. `logger.py`는 Python logging 래퍼 수준.

**제공 시점**: P1. 텔레메트리 인터페이스 구현 시 로깅 레이어를 동시에 구축한다.

---

### 8. 설정 변경의 적용 시점과 rollback 방법을 어떻게 할 것인지

**제안: Staging → Validate → Apply 3단계**

1. `set_config_staging(patch)` — 변경 사항을 staging 영역에 저장. 실 적용 안 됨.
2. `validate_config()` — staging config의 유효성 검증. diff 반환.
3. `apply_config()` — staging을 active config로 교체. 이전 config를 backup으로 보관.
4. `rollback_config()` — backup에서 복원.

**적용 시점:**
- `apply_config()` 호출 시 즉시 적용. 다음 제어 사이클부터 새 config 사용.
- 비행 중 적용 가능한 파라미터(게인, 임계치)와 재시작 필요 파라미터(output backend, loop_hz)를 구분한다.

**현재 상태:**
- `load_v2_config()`로 YAML 로딩과 override merge는 구현됨.
- 런타임 설정 교체, staging, rollback은 미구현.
- `V2Config`가 dataclass이므로 `replace()`로 부분 교체는 기술적으로 가능.

**제공 시점**: P2. 초기에는 설정 조회(`get_config`)만 제공하고, staging/rollback은 운영 고도화 단계에서 구현한다.

---

## 제공 일정 요약

| 항목 | 우선순위 | 현재 상태 | 제공 시점 |
|------|----------|-----------|-----------|
| 텔레메트리 서버 스켈레톤 + 샘플 payload | P0 | 미구현 | GCS 초기 개발 착수 전 |
| 명령 API 초안 (운용 명령) | P0 | 미구현 | 동일 |
| 상태 머신 + 전이 조건 명세 | P0 | 코드에 존재, 문서화 필요 | 동일 |
| failsafe 이유 코드 Enum 고정 | P0 | 문자열 → Enum 전환 필요 | 동일 |
| 이벤트 push 시스템 | P0 | 미구현 | 동일 |
| FC 텔레메트리 확장 (armed, battery 등) | P1 | `VehicleState` 확장 필요 | 초도 운용 전 |
| 비디오 메타데이터 동기화 | P1 | 타임스탬프 존재, 스트리밍 없음 | 초도 운용 전 |
| 세션 로그 (JSONL) | P1 | 미구현 | 초도 운용 전 |
| 세션/설정 명령 API | P2 | 미구현 | 운영 고도화 |
| 원격 파라미터 튜닝 / replay API | P2 | 미구현 | 운영 고도화 |

---

## GCS 개발 시작 조건 (11절) 충족 계획

1. **텔레메트리 샘플 payload** — Tracker 텔레메트리는 `RuntimeState` 직렬화로 즉시 생성 가능. Vehicle 텔레메트리는 `VehicleState` 확장 후 제공.
2. **명령 API 초안** — WebSocket RPC 스키마 문서와 함께 제공.
3. **상태 머신 및 이벤트 코드 목록** — `ModeManager.decide()` 기반으로 전이 테이블 + 이벤트 코드 목록 추출하여 제공.

→ 위 3가지를 우선 작업하여 GCS 초기 개발 착수를 지원한다.
