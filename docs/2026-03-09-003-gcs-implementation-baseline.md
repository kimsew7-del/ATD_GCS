# ATD_GCS 구현 기준서

- 작성일: `2026-03-09`
- 문서번호: `003`

## 목적

이 문서는 `ATD_GCS` 구현 시 참조할 기준 계약을 고정한다.

기준 원칙:

- 날짜순 최신 문서 5개만 유효 계약으로 본다.
- 그 이전 문서의 충돌 내용은 무시한다.
- 구현은 이 문서와 최신 5개 문서를 기준으로 진행한다.
- GCS 기본 기능 범위는 [`2026-03-09-002-gcs-core-features.md`](/Users/daon/projects/ATD_GCS/docs/2026-03-09-002-gcs-core-features.md)를 따른다.
- 저장소 코드 기준 추가 대응은 [`2026-03-09-004-gcs-v2-repo-delta-response.md`](/Users/daon/projects/ATD_GCS/docs/2026-03-09-004-gcs-v2-repo-delta-response.md)를 따른다.

## 유효 기준 문서

아래 5개 문서만 현재 유효한 외부 계약으로 사용한다.

- `docs/gcs-interface-response.md`
- `docs/gcs-telemetry-samples.md`
- `docs/gcs-command-schema.md`
- `docs/gcs-event-codes.md`
- `docs/gcs-state-machine.md`

## 무시 대상 문서

아래 문서는 배경 문서로만 보고, 충돌 시 구현 기준으로 사용하지 않는다.

- `docs/drone-system-requirements-for-gcs.md`
- `docs/gcs-followup-request.md`

## 구현 기준 요약

### 1. 제품 구조

ATD_GCS는 아래 성격으로 구현한다.

- 기본 GCS 기능 세트 보유
- 그 위에 ATD 추적 전용 기능 추가

초기 상위 뷰 기준:

- Fly
- Plan
- Setup
- Analyze

### 2. 통신 구조

- Telemetry: WebSocket JSON push
- Command: WebSocket RPC JSON request-response
- Event: `/ws/events` JSON push
- Video: 별도 채널, 현재 GCS 1차 구현 범위에서는 분리 취급

### 3. Telemetry 채널

초기 GCS는 아래 3개 채널을 기준으로 상태 스토어를 만든다.

- `/ws/telemetry/vehicle`
- `/ws/telemetry/tracker`
- `/ws/telemetry/health`

공통 필드:

- `schema_version`
- `timestamp`
- `sequence`

### 4. Command RPC

초기 GCS는 아래 6개 명령만 1차 지원 대상으로 본다.

- `set_requested_mode`
- `start_tracking`
- `stop_tracking`
- `arm`
- `disarm`
- `reset_failsafe_latch`

응답 처리 기준:

- `status: ok`
- `status: error`
- `status: accepted`는 공통 포맷에 존재하지만, 초기 6개 명령은 모두 동기 명령으로 처리한다.

### 5. 상태 머신

GCS 상태 배지와 운용 화면은 아래 모드를 기준으로 구현한다.

- `manual`
- `search`
- `track_cruise`
- `track_dive`
- `strike`
- `track_continuation`
- `reacquire`
- `target_switch_verify`
- `abort_recover`
- `failsafe`

단, `strike`는 외부 회신 문서보다 저장소 코드가 앞서 있는 항목이므로, 서버 capability가 광고할 때 우선 수용한다.

### 6. 이벤트 채널

초기 GCS는 아래 이벤트를 우선 지원한다.

- `mode_changed`
- `failsafe_entered`
- `failsafe_cleared`
- `target_lost`
- `target_reacquired`
- `output_send_failed`
- `operator_override_detected`
- `heartbeat_lost`
- `frame_timeout`

## GCS 1차 구현 범위

이 기준으로 바로 구현 가능한 범위는 아래다.

### 필수

- 상단 toolbar 상태 영역
- Fly View
- WebSocket 연결 관리자
- telemetry/event message parser
- vehicle/tracker/health 상태 스토어
- command RPC 클라이언트
- 모드 배지 및 상태 패널
- 이벤트 로그 패널
- 연결 상태 표시
- vehicle messages 영역

### 권장

- Setup summary view
- Analyze view placeholder
- mock telemetry server
- schema_version 체크
- sequence gap 감지
- 최근 event 버퍼
- command 응답 에러 표시

### 보류

- Plan view 상세 구현
- 비디오 오버레이
- 설정 편집 UI
- 세션 로그 다운로드 UI
- replay UI

## 화면 구성 기준

초기 GCS 화면은 아래 상위 뷰 구조를 가진다.

- Fly
- Plan
- Setup
- Analyze

초기 구현은 Fly 중심으로 시작하되, 나머지 뷰 자리도 함께 잡는다.

### 1. Toolbar

표시 항목:

- 연결 상태
- arm 상태
- FC mode
- battery
- RC/video link 상태
- tracker mode
- airframe / vehicle type
- target lock 상태
- failsafe 상태

### 2. Vehicle Panel

표시 항목:

- link 상태
- arm 상태
- FC mode
- roll/pitch/yaw rate
- altitude AGL
- battery
- RC/video link 상태

### 3. Tracker Panel

표시 항목:

- controller mode
- requested mode
- target detected
- target confidence
- frame age
- continuity score
- candidate frames
- abort_required
- failsafe_active
- failsafe_reasons
- output backend
- output failure count

### 4. Health Panel

표시 항목:

- mavlink connected
- mavlink latency
- frame rate ok
- frame latency
- control rate ok
- control loop ms
- cycle budget status
- detector ok
- tracker ok
- storage ok

### 5. Event Panel

표시 항목:

- severity
- code
- message
- timestamp
- context 일부 요약

### 6. Command Panel

버튼:

- Arm
- Disarm
- Start Tracking
- Stop Tracking
- Reset Failsafe
- Switch to Cruise
- Switch to Dive

## 버튼 처리 기준

초기 구현은 `gcs-state-machine.md`의 버튼 활성 조건을 기본으로 사용한다.

- Start Tracking: `manual` 또는 `search`
- Stop Tracking: `manual`, `failsafe` 이외
- Switch to Dive: `track_cruise` + `enable_dive_mode=true`
- Switch to Cruise: `track_dive`
- Reset Failsafe: `failsafe`
- Arm: `manual` + `not armed`
- Disarm: `armed`

단, 아래 2개는 아직 확인 필요 항목으로 남긴다.

1. failsafe 상태에서 `stop_tracking` 허용 여부
2. `enable_dive_mode` 값을 GCS가 어떤 채널에서 받는지

초기 구현에서는 이 두 항목을 feature flag 또는 conservative disable 방식으로 처리한다.

## 데이터 처리 기준

### timestamp

- 모든 시간은 epoch seconds float로 수신
- GCS 내부에서는 표시용 포맷과 경과시간 계산을 분리

### sequence

- 채널별 별도 관리
- 누락이 감지되면 연결 품질 경고만 표시하고 치명 오류로 간주하지 않음

### nullable

- `altitude_agl_m`, `battery_voltage`, `battery_remaining_pct`는 null 가능
- null은 숫자 0으로 대체하지 않고 "N/A" 또는 "Unknown"으로 표시

## 남은 확인 포인트

최신 5개 문서 기준으로도 아래는 명시적으로 확인이 필요하다.

### 1. failsafe 중 `stop_tracking`

- `gcs-command-schema.md`는 허용처럼 읽힌다.
- `gcs-state-machine.md`는 failsafe에서 `reset_failsafe_latch`, `disarm`만 허용처럼 읽힌다.

초기 구현 방침:

- failsafe 상태에서는 `Stop Tracking` 버튼을 비활성화한다.
- 추후 드론 시스템 구현이 확정되면 완화한다.

### 2. `abort_recover`와 `failsafe` 표시 차이

- `abort_recover`: 추적 실패/안전 복귀 상태
- `failsafe`: 시스템 오류 또는 통신 이상 상태

초기 구현 방침:

- 둘 다 빨간 계열 경고로 표시하되,
- `failsafe`는 최상위 치명 상태로 별도 배지와 알림음을 적용한다.

### 3. 비디오 메타데이터

- `frame_timestamp`는 정의되어 있다.
- bbox, target id는 최신 샘플 payload에 없다.

초기 구현 방침:

- 비디오 오버레이는 1차 범위에서 제외한다.

## 개발 순서

권장 구현 순서:

1. 상위 뷰 구조(Fly/Plan/Setup/Analyze)
2. schema 타입 정의
3. websocket client + parser
4. 상태 스토어
5. toolbar + event log UI
6. Fly view vehicle/tracker/health 패널
7. command RPC 버튼
8. mock 데이터 주입 및 수동 테스트

## 결론

현재 기준으로 `ATD_GCS`는 mock 기반 초기 개발을 시작할 수 있다.

드론 시스템의 실제 서버 구현 전이라도, 최신 5개 문서를 계약으로 삼아 아래를 선행 개발한다.

- 상태 표시 UI
- 이벤트 로그 UI
- 명령 전송 UI
- telemetry/event 처리 계층

실기 연동 전에는 남은 확인 포인트만 별도로 관리한다.
