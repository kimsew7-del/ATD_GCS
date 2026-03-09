# ATD v2 명령 RPC 스키마

**작성일**: 2026-03-09
**스키마 버전**: `0.1.0`
**대상 문서**: `gcs-followup-request.md` 2절

---

## 공통 포맷

### 요청

```json
{
  "schema_version": "0.1.0",
  "request_id": "uuid-string",
  "command": "command_name",
  "params": {},
  "timestamp": 1741527622.384
}
```

### 성공 응답

```json
{
  "schema_version": "0.1.0",
  "request_id": "uuid-string",
  "status": "ok",
  "result": {},
  "error": null,
  "timestamp": 1741527622.392
}
```

### 실패 응답

```json
{
  "schema_version": "0.1.0",
  "request_id": "uuid-string",
  "status": "error",
  "result": null,
  "error": {
    "code": "error_code",
    "message": "사람이 읽을 수 있는 설명"
  },
  "timestamp": 1741527622.392
}
```

### 공통 필드 명세

| 필드 | 타입 | 비고 |
|------|------|------|
| `schema_version` | string | semver |
| `request_id` | string | 클라이언트 생성 UUID. 응답에 그대로 반환 |
| `command` | string | 명령 이름 |
| `params` | object | 명령별 파라미터 |
| `status` | string | `"ok"` \| `"error"` \| `"accepted"` |
| `result` | object\|null | 명령별 결과 |
| `error` | object\|null | 실패 시 `{ code, message }` |
| `timestamp` | float | epoch sec, UTC |

### 비동기 명령 처리

`status: "accepted"` 응답을 받은 경우, 완료는 이벤트 채널(`/ws/events`)에서 `command_completed` 또는 `command_failed` 이벤트로 통지한다. 초기 6개 명령은 **모두 동기**이다.

---

## 명령별 스키마

### 1. `set_requested_mode`

추적 제어기의 요청 모드를 변경한다.

**동기/비동기**: 동기
**적용 시점**: 다음 제어 사이클부터 적용

#### 허용 mode enum

```
manual, search, track_cruise, track_dive
```

> `track_continuation`, `reacquire`, `target_switch_verify`, `abort_recover`, `failsafe`는 시스템 내부 전이 전용이므로 외부 요청 불가.

#### 요청

```json
{
  "schema_version": "0.1.0",
  "request_id": "a1b2c3d4",
  "command": "set_requested_mode",
  "params": {
    "mode": "track_cruise"
  },
  "timestamp": 1741527622.384
}
```

#### 성공 응답

```json
{
  "schema_version": "0.1.0",
  "request_id": "a1b2c3d4",
  "status": "ok",
  "result": {
    "previous_mode": "manual",
    "accepted_mode": "track_cruise",
    "effective_mode": "track_cruise"
  },
  "error": null,
  "timestamp": 1741527622.392
}
```

#### 실패 응답 — 잘못된 모드

```json
{
  "schema_version": "0.1.0",
  "request_id": "a1b2c3d4",
  "status": "error",
  "result": null,
  "error": {
    "code": "invalid_mode",
    "message": "Mode 'reacquire' is not externally requestable"
  },
  "timestamp": 1741527622.392
}
```

#### 실패 응답 — failsafe 중 요청

```json
{
  "schema_version": "0.1.0",
  "request_id": "a1b2c3d4",
  "status": "error",
  "result": null,
  "error": {
    "code": "failsafe_active",
    "message": "Cannot change mode while failsafe is active. Clear failsafe first."
  },
  "timestamp": 1741527622.392
}
```

#### 특수 케이스

| 상황 | 처리 |
|------|------|
| `track_dive` 요청, `enable_dive_mode=false` | `status: "ok"`, `effective_mode: "track_cruise"` (자동 fallback). `accepted_mode`와 `effective_mode`가 다름을 GCS가 감지 |
| failsafe 중 mode 변경 요청 | `status: "error"`, `code: "failsafe_active"` |
| 이미 같은 mode | `status: "ok"`, 정상 응답 |
| 존재하지 않는 mode 문자열 | `status: "error"`, `code: "invalid_mode"` |

#### error.code 목록

| 코드 | 설명 |
|------|------|
| `invalid_mode` | 존재하지 않거나 외부 요청 불가능한 모드 |
| `failsafe_active` | failsafe 해제 전 모드 변경 불가 |

---

### 2. `start_tracking`

추적을 시작한다. `set_requested_mode(track_cruise)`의 편의 명령.

**동기/비동기**: 동기
**적용 시점**: 다음 제어 사이클

#### 요청

```json
{
  "schema_version": "0.1.0",
  "request_id": "b2c3d4e5",
  "command": "start_tracking",
  "params": {},
  "timestamp": 1741527622.384
}
```

#### 성공 응답

```json
{
  "schema_version": "0.1.0",
  "request_id": "b2c3d4e5",
  "status": "ok",
  "result": {
    "previous_mode": "manual",
    "effective_mode": "track_cruise"
  },
  "error": null,
  "timestamp": 1741527622.392
}
```

#### error.code 목록

| 코드 | 설명 |
|------|------|
| `failsafe_active` | failsafe 중 추적 시작 불가 |
| `not_armed` | FC 미시동 상태에서 추적 시작 불가 |

---

### 3. `stop_tracking`

추적을 중지하고 MANUAL 모드로 전환한다.

**동기/비동기**: 동기
**적용 시점**: 다음 제어 사이클

#### 요청

```json
{
  "schema_version": "0.1.0",
  "request_id": "c3d4e5f6",
  "command": "stop_tracking",
  "params": {},
  "timestamp": 1741527622.384
}
```

#### 성공 응답

```json
{
  "schema_version": "0.1.0",
  "request_id": "c3d4e5f6",
  "status": "ok",
  "result": {
    "previous_mode": "track_cruise",
    "effective_mode": "manual"
  },
  "error": null,
  "timestamp": 1741527622.392
}
```

#### error.code 목록

없음. 어떤 상태에서든 항상 성공한다. failsafe 중에도 MANUAL 전환은 허용한다.

---

### 4. `arm`

비행제어기에 시동 명령을 중계한다.

**동기/비동기**: 동기 (FC 응답 대기, 타임아웃 2초)
**적용 시점**: FC가 수락하면 즉시

#### 요청

```json
{
  "schema_version": "0.1.0",
  "request_id": "d4e5f6g7",
  "command": "arm",
  "params": {},
  "timestamp": 1741527622.384
}
```

#### 성공 응답

```json
{
  "schema_version": "0.1.0",
  "request_id": "d4e5f6g7",
  "status": "ok",
  "result": {
    "armed": true
  },
  "error": null,
  "timestamp": 1741527622.892
}
```

#### 실패 응답

```json
{
  "schema_version": "0.1.0",
  "request_id": "d4e5f6g7",
  "status": "error",
  "result": null,
  "error": {
    "code": "fc_rejected",
    "message": "Flight controller rejected arm command: pre-arm checks failed"
  },
  "timestamp": 1741527624.384
}
```

#### error.code 목록

| 코드 | 설명 |
|------|------|
| `fc_rejected` | FC가 arm 거부 (pre-arm check 실패 등) |
| `fc_timeout` | FC 응답 타임아웃 (2초) |
| `fc_not_connected` | MAVLink 미연결 |

---

### 5. `disarm`

비행제어기에 시동 해제 명령을 중계한다.

**동기/비동기**: 동기 (FC 응답 대기, 타임아웃 2초)
**적용 시점**: FC가 수락하면 즉시

#### 요청

```json
{
  "schema_version": "0.1.0",
  "request_id": "e5f6g7h8",
  "command": "disarm",
  "params": {},
  "timestamp": 1741527622.384
}
```

#### 성공 응답

```json
{
  "schema_version": "0.1.0",
  "request_id": "e5f6g7h8",
  "status": "ok",
  "result": {
    "armed": false
  },
  "error": null,
  "timestamp": 1741527622.892
}
```

#### error.code 목록

| 코드 | 설명 |
|------|------|
| `fc_rejected` | FC가 disarm 거부 (비행 중 등) |
| `fc_timeout` | FC 응답 타임아웃 |
| `fc_not_connected` | MAVLink 미연결 |

---

### 6. `reset_failsafe_latch`

failsafe 상태를 해제하고 MANUAL 모드로 복귀한다.

**동기/비동기**: 동기
**적용 시점**: 다음 제어 사이클

#### 요청

```json
{
  "schema_version": "0.1.0",
  "request_id": "f6g7h8i9",
  "command": "reset_failsafe_latch",
  "params": {},
  "timestamp": 1741527622.384
}
```

#### 성공 응답

```json
{
  "schema_version": "0.1.0",
  "request_id": "f6g7h8i9",
  "status": "ok",
  "result": {
    "previous_mode": "failsafe",
    "effective_mode": "manual",
    "cleared_reasons": ["output_send_failed"]
  },
  "error": null,
  "timestamp": 1741527622.392
}
```

#### 실패 응답

```json
{
  "schema_version": "0.1.0",
  "request_id": "f6g7h8i9",
  "status": "error",
  "result": null,
  "error": {
    "code": "not_in_failsafe",
    "message": "System is not in failsafe state"
  },
  "timestamp": 1741527622.392
}
```

#### error.code 목록

| 코드 | 설명 |
|------|------|
| `not_in_failsafe` | 현재 failsafe 상태가 아님 |
| `unresolved_condition` | failsafe 원인이 아직 해소되지 않음 (예: FC 통신 여전히 두절) |

---

## 전체 error.code 통합 목록

| 코드 | 발생 명령 |
|------|-----------|
| `invalid_mode` | `set_requested_mode` |
| `failsafe_active` | `set_requested_mode`, `start_tracking` |
| `not_armed` | `start_tracking` |
| `fc_rejected` | `arm`, `disarm` |
| `fc_timeout` | `arm`, `disarm` |
| `fc_not_connected` | `arm`, `disarm` |
| `not_in_failsafe` | `reset_failsafe_latch` |
| `unresolved_condition` | `reset_failsafe_latch` |
| `invalid_request` | 공통 — 파싱 실패, 필수 필드 누락 |
| `unknown_command` | 공통 — 존재하지 않는 명령 |
