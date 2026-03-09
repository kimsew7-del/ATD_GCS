# ATD v2 이벤트 및 Failsafe 코드 목록

**작성일**: 2026-03-09
**스키마 버전**: `0.1.0`
**대상 문서**: `gcs-followup-request.md` 3절, 4절

---

## 1. 이벤트 공통 포맷

**채널**: `/ws/events`

```json
{
  "schema_version": "0.1.0",
  "event_id": "evt-uuid-string",
  "timestamp": 1741527622.384,
  "sequence": 1042,
  "severity": "warning",
  "code": "event_code",
  "message": "사람이 읽을 수 있는 설명",
  "context": {}
}
```

### 공통 필드 명세

| 필드 | 타입 | 비고 |
|------|------|------|
| `schema_version` | string | semver |
| `event_id` | string | 서버 생성 UUID |
| `timestamp` | float | epoch sec, UTC |
| `sequence` | int | 이벤트 채널 단조 증가 |
| `severity` | string | `"info"` \| `"warning"` \| `"critical"` |
| `code` | string | 이벤트 코드 (아래 목록) |
| `message` | string | 사람이 읽을 수 있는 설명 |
| `context` | object | 이벤트별 추가 데이터 |

---

## 2. 필수 이벤트 목록

### 2.1 `mode_changed`

**severity**: `info`
**발생 시점**: 제어기 모드가 전이될 때마다

```json
{
  "schema_version": "0.1.0",
  "event_id": "evt-001",
  "timestamp": 1741527622.404,
  "sequence": 1042,
  "severity": "info",
  "code": "mode_changed",
  "message": "Mode changed: manual -> track_cruise (operator_command)",
  "context": {
    "previous_mode": "manual",
    "current_mode": "track_cruise",
    "reason_code": "requested",
    "requested_mode": "track_cruise",
    "trigger_source": "gcs_command"
  }
}
```

#### context 필드

| 필드 | 타입 | 비고 |
|------|------|------|
| `previous_mode` | string | 전이 전 모드 |
| `current_mode` | string | 전이 후 모드 |
| `reason_code` | string | `ModeDecision.reason` 값 (아래 테이블 참조) |
| `requested_mode` | string | 외부에서 요청한 모드 |
| `trigger_source` | string | `"gcs_command"` \| `"pilot_override"` \| `"auto_transition"` \| `"failsafe"` |

#### reason_code 목록

| 코드 | 설명 |
|------|------|
| `requested` | 외부 요청대로 전이 |
| `failsafe` | failsafe 조건 발생 |
| `global_override` | 조종자 전 축 override |
| `dive_disabled` | TRACK_DIVE 비활성, TRACK_CRUISE로 fallback |
| `target_lost` | 타겟 신뢰도 0 이하 |
| `blind_timeout` | blind 시간 초과 |
| `target_visible_again` | continuation 중 타겟 재감지 |
| `same_target_cruise` | 동일 타겟 재획득 (cruise) |
| `same_target_dive` | 동일 타겟 재획득 (dive) |
| `switch_candidate` | 타겟 전환 후보 감지 |
| `switch_confirmed` | 타겟 전환 확정 |
| `switch_verifying` | 타겟 전환 검증 중 |
| `reacquire_abort` | 재획득 정책 abort |
| `switch_abort` | 전환 검증 abort |
| `verify_more` | 추가 검증 필요 |

---

### 2.2 `failsafe_entered`

**severity**: `critical`
**발생 시점**: failsafe 모드 진입 시

```json
{
  "schema_version": "0.1.0",
  "event_id": "evt-002",
  "timestamp": 1741527625.204,
  "sequence": 1043,
  "severity": "critical",
  "code": "failsafe_entered",
  "message": "Failsafe activated: output_send_failed",
  "context": {
    "failsafe_reasons": ["output_send_failed"],
    "previous_mode": "track_cruise"
  }
}
```

---

### 2.3 `failsafe_cleared`

**severity**: `info`
**발생 시점**: `reset_failsafe_latch` 명령으로 failsafe 해제 시

```json
{
  "schema_version": "0.1.0",
  "event_id": "evt-003",
  "timestamp": 1741527630.100,
  "sequence": 1044,
  "severity": "info",
  "code": "failsafe_cleared",
  "message": "Failsafe cleared, returning to manual",
  "context": {
    "cleared_reasons": ["output_send_failed"],
    "effective_mode": "manual"
  }
}
```

---

### 2.4 `target_lost`

**severity**: `warning`
**발생 시점**: 추적 중 타겟 신뢰도가 0 이하로 떨어질 때 (TRACK → CONTINUATION 전이)

```json
{
  "schema_version": "0.1.0",
  "event_id": "evt-004",
  "timestamp": 1741527622.980,
  "sequence": 1045,
  "severity": "warning",
  "code": "target_lost",
  "message": "Target lost during track_cruise",
  "context": {
    "last_confidence": 0.87,
    "last_position_x_norm": 0.12,
    "last_position_y_norm": -0.05,
    "tracking_mode_at_loss": "track_cruise"
  }
}
```

---

### 2.5 `target_reacquired`

**severity**: `info`
**발생 시점**: REACQUIRE → TRACK_CRUISE/DIVE 전이 시 (동일 타겟 확인)

```json
{
  "schema_version": "0.1.0",
  "event_id": "evt-005",
  "timestamp": 1741527623.280,
  "sequence": 1046,
  "severity": "info",
  "code": "target_reacquired",
  "message": "Same target reacquired (score=0.85)",
  "context": {
    "continuity_score": 0.85,
    "loss_duration_ms": 300,
    "effective_mode": "track_cruise"
  }
}
```

---

### 2.6 `output_send_failed`

**severity**: `warning` (단발) / `critical` (failsafe 진입 시)
**발생 시점**: ELRS/출력 백엔드 전송 실패 시

```json
{
  "schema_version": "0.1.0",
  "event_id": "evt-006",
  "timestamp": 1741527625.180,
  "sequence": 1047,
  "severity": "warning",
  "code": "output_send_failed",
  "message": "Output send failed on elrs backend",
  "context": {
    "backend": "elrs",
    "error": "OSError: [Errno 5] Input/output error",
    "failure_count": 1,
    "failsafe_threshold": 3
  }
}
```

---

### 2.7 `operator_override_detected`

**severity**: `info`
**발생 시점**: 조종자 스틱 입력이 override 임계치 초과 시

```json
{
  "schema_version": "0.1.0",
  "event_id": "evt-007",
  "timestamp": 1741527626.404,
  "sequence": 1048,
  "severity": "info",
  "code": "operator_override_detected",
  "message": "Pilot override: all axes",
  "context": {
    "override_roll": true,
    "override_pitch": true,
    "override_throttle": true,
    "override_yaw": true,
    "is_global": true
  }
}
```

---

### 2.8 `heartbeat_lost`

**severity**: `critical`
**발생 시점**: FC MAVLink heartbeat 수신 중단 시

```json
{
  "schema_version": "0.1.0",
  "event_id": "evt-008",
  "timestamp": 1741527628.000,
  "sequence": 1049,
  "severity": "critical",
  "code": "heartbeat_lost",
  "message": "MAVLink heartbeat lost for 2.0s",
  "context": {
    "last_heartbeat": 1741527626.000,
    "timeout_ms": 2000
  }
}
```

---

### 2.9 `frame_timeout`

**severity**: `warning`
**발생 시점**: 비전 프레임 수신이 stale_frame_timeout_s(150ms) 초과 시

```json
{
  "schema_version": "0.1.0",
  "event_id": "evt-009",
  "timestamp": 1741527629.500,
  "sequence": 1050,
  "severity": "warning",
  "code": "frame_timeout",
  "message": "Vision frame timeout: 180ms since last frame",
  "context": {
    "last_frame_timestamp": 1741527629.320,
    "elapsed_ms": 180,
    "threshold_ms": 150
  }
}
```

---

## 3. Failsafe 코드 Enum

### 확정 목록

| 코드 | 의미 | 발생 계층 | 자동 복구 | GCS severity |
|------|------|-----------|-----------|--------------|
| `output_send_failed` | ELRS/출력 백엔드 전송 실패 누적 | Output | 불가. 수동 해제 필요 | critical |
| `blind_timeout` | 타겟 상실 후 blind 시간 초과 | Mode Manager | 불가. ABORT_RECOVER 전이 | critical |
| `low_altitude_margin` | 저고도 안전 마진 위반 (AGL < 5m) | Safety Envelope | 불가. ABORT_RECOVER 전이 | critical |
| `continuation_bank_limit` | continuation 중 bank 한계 초과 | Safety Envelope | 불가. ABORT_RECOVER 전이 | critical |
| `reacquire_abort` | 재획득 정책 abort 판정 | Reacquisition Policy | 불가. ABORT_RECOVER 전이 | warning |
| `switch_abort` | 타겟 전환 검증 중 abort 판정 | Mode Manager | 불가. ABORT_RECOVER 전이 | warning |
| `mavlink_heartbeat_lost` | FC 통신 두절 | Comm | 자동 복구 가능 (heartbeat 재수신 시) | critical |
| `video_frame_timeout` | 비전 입력 중단 | Vision Stack | 자동 복구 가능 (프레임 재수신 시) | critical |
| `detector_failure` | 객체 감지 모듈 오류 | Vision Stack | 불가. 재시작 필요 | critical |
| `rc_link_lost` | RC 수신기 링크 두절 | Comm | 자동 복구 가능 (RC 재연결 시) | critical |

### 분류

**자동 복구 가능** (`mavlink_heartbeat_lost`, `video_frame_timeout`, `rc_link_lost`):
- 원인이 해소되면 시스템이 자동으로 failsafe_reasons에서 제거
- GCS `reset_failsafe_latch` 없이 정상 복귀 가능

**수동 해제 필요** (나머지):
- GCS에서 `reset_failsafe_latch` 명령 필요
- `unresolved_condition` 에러로 거부될 수 있음 (원인 미해소 시)

### GCS 표시 가이드

- `critical`: 빨간색 배지, 경고음, 즉시 대응 필요
- `warning`: 주황색 배지, 운영자 주의 필요
