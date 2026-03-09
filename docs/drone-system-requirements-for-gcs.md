# Auto-Tracking-Drone v2 GCS 연동 요구사항

## 목적

이 문서는 `ATD_GCS` 개발 관점에서 `Auto-Tracking-Drone v2` 시스템에 요구하는 최소 연동 조건을 정리한다.

핵심 목표는 아래와 같다.

- GCS가 드론의 현재 상태를 안정적으로 볼 수 있어야 한다.
- GCS가 운용 명령을 일관된 방식으로 전달할 수 있어야 한다.
- 추적 제어기 상태와 비행제어기 상태를 분리해서 관찰할 수 있어야 한다.
- 비행 중 사고 분석과 재현을 위한 로그를 확보할 수 있어야 한다.

이 문서는 UI 요구사항이 아니라 `드론 시스템 <-> GCS` 계약 문서다.

## 결론

현재 `v2` 코드는 제어기 내부 구조와 시뮬레이션 경로는 있으나, GCS가 붙을 외부 인터페이스가 부족하다.

GCS 개발을 시작하려면 드론 시스템은 최소한 아래 4가지를 제공해야 한다.

1. 표준화된 상태/텔레메트리 출력
2. 표준화된 명령 입력
3. 모드/권한/안전 상태의 명확한 상태 머신
4. 재현 가능한 로그와 이벤트 기록

## 요구사항 우선순위

### P0. 없으면 GCS 개발 불가

- 드론 시스템 외부에서 접근 가능한 실시간 텔레메트리 인터페이스
- 드론 시스템 외부에서 전달 가능한 실시간 명령 인터페이스
- 드론 제어기 상태 머신 정의
- failsafe와 abort 이유 코드 정의
- 비행제어기 링크 상태와 추적 제어기 상태의 분리 노출

### P1. 초도 운용 전에 필요

- 비디오 스트림 메타데이터 연동
- 타겟 추적 상태와 continuity/reacquisition 상태 노출
- 세션 로그 저장 및 재생 가능한 포맷
- 설정값 조회/적용/버전 식별

### P2. 운영 고도화 단계

- 원격 파라미터 튜닝
- replay 기반 디버깅 API
- 임무/시나리오 관리
- 다중 기체 확장 고려

## 1. 상태 텔레메트리 요구사항

GCS는 아래 상태를 최소 5 Hz 이상으로 받아야 하고, 비행 핵심 상태는 20~50 Hz가 바람직하다.

### 1.1 Vehicle Telemetry

필수 필드:

- `timestamp`
- `link_ok`
- `armed`
- `flight_mode_fc`
- `roll_deg`
- `pitch_deg`
- `yaw_deg` 또는 `yaw_rate_dps`
- `throttle_input` 또는 현재 throttle command
- `altitude_agl_m` 또는 동등한 저고도 판단 값
- `battery_voltage`
- `battery_remaining_pct`
- `gps_fix_type` 또는 `gps_unavailable`
- `rc_link_ok`
- `video_link_ok`

설명:

- GCS는 추적 제어기 상태만으로는 안전 운용을 판단할 수 없다.
- FC 기준 상태와 링크 상태를 따로 봐야 한다.

### 1.2 Tracker / Controller Telemetry

필수 필드:

- `controller_mode`
- `requested_mode`
- `target_detected`
- `target_confidence`
- `frame_age_ms`
- `target_lost_since`
- `continuity_score`
- `candidate_frames`
- `abort_required`
- `failsafe_active`
- `failsafe_reasons[]`
- `output_backend`
- `output_send_ok`
- `output_failure_count`

권장 필드:

- `predicted_center_x_norm`
- `predicted_center_y_norm`
- `image_velocity_x`
- `image_velocity_y`
- `scale_rate`
- `last_guidance`
- `last_envelope_clipped_axes[]`

설명:

- GCS는 단순히 "타겟 있음/없음"만 보면 안 된다.
- continuation, reacquire, switch verify 중 어디에 걸려 있는지 보여야 운용 판단이 가능하다.

### 1.3 Health Telemetry

필수 필드:

- `mavlink_connected`
- `mavlink_latency_ms`
- `frame_rate_ok`
- `frame_latency_ms`
- `control_rate_ok`
- `control_loop_ms`
- `detector_ok`
- `tracker_ok`
- `storage_ok`

## 2. 명령 인터페이스 요구사항

GCS는 아래 명령을 드론 시스템에 보낼 수 있어야 한다.

### 2.1 운용 명령

- `arm`
- `disarm`
- `set_requested_mode`
- `set_manual_override`
- `clear_manual_override`
- `acknowledge_alert`
- `start_tracking`
- `stop_tracking`
- `reset_failsafe_latch`

### 2.2 세션 명령

- `start_session`
- `stop_session`
- `start_recording`
- `stop_recording`
- `mark_event`

### 2.3 설정 명령

- `get_config`
- `set_config_staging`
- `validate_config`
- `apply_config`
- `rollback_config`

조건:

- 모든 명령은 성공/실패 응답과 이유 코드를 반환해야 한다.
- 비동기 명령이면 `accepted`, `in_progress`, `completed`, `failed` 상태를 가져야 한다.
- 명령마다 `request_id`가 있어야 한다.

## 3. 상태 머신 요구사항

GCS가 운용 UI를 만들려면 드론 시스템의 상태 머신이 고정돼야 한다.

최소한 아래 상태를 외부에 공개해야 한다.

- `MANUAL`
- `SEARCH`
- `TRACK_CRUISE`
- `TRACK_DIVE`
- `TRACK_CONTINUATION`
- `REACQUIRE`
- `TARGET_SWITCH_VERIFY`
- `ABORT_RECOVER`
- `FAILSAFE`

추가 요구:

- 각 상태의 진입 조건
- 각 상태의 종료 조건
- 자동 전이 조건
- 조종자 override 우선순위
- failsafe 우선순위
- 상태 전이 시 이벤트 코드

GCS는 이 정의가 없으면 버튼 활성화 조건, 경고 표시, 상태 배지, 운용 절차를 설계할 수 없다.

## 4. 권한과 우선순위 요구사항

GCS는 아래 우선순위를 명확히 알아야 한다.

1. 하드 failsafe
2. 조종자 수동 takeover
3. 운영자 GCS 명령
4. 자동 추적 제어기

드론 시스템은 아래를 외부에 알려야 한다.

- 현재 누가 제어권을 갖는지
- 축별 override 상태가 있는지
- GCS 명령이 거부된 이유
- 수동 takeover 이후 복귀 조건

## 5. 이벤트/알림 요구사항

GCS에는 상태값 polling만으로 부족하고, 중요한 이벤트가 push 형태로 와야 한다.

필수 이벤트:

- heartbeat lost
- frame timeout
- target lost
- target reacquired
- failsafe entered
- failsafe cleared
- mode changed
- output send failed
- operator override detected
- config applied

각 이벤트는 아래를 포함해야 한다.

- `event_id`
- `timestamp`
- `severity`
- `code`
- `message`
- `context`

## 6. 로그 요구사항

GCS 개발과 운용 분석을 위해 아래 로그가 필요하다.

### 6.1 실시간 로그

- 최근 N초 상태 버퍼
- 최근 경고/오류 이벤트 버퍼
- 최근 명령 이력

### 6.2 영구 로그

- 비행 세션 메타데이터
- 상태 전이 로그
- 추적 결과 로그
- control command 로그
- envelope clipping 로그
- failsafe/abort 로그
- operator command 로그

### 6.3 로그 포맷 조건

- 세션 단위 파일 저장
- UTC timestamp 포함
- 비디오 프레임 또는 추적 결과와 시간 정렬 가능
- replay 가능한 구조

## 7. 비디오/추적 데이터 요구사항

GCS는 단순 RTSP 화면만 받는 것으로는 부족하다.

최소한 아래 메타데이터가 필요하다.

- 현재 프레임 timestamp
- detector output count
- 선택된 target id 또는 target index
- bbox 좌표
- confidence
- tracker state

권장:

- 비디오 스트림과 메타데이터를 같은 시간축으로 정렬
- 지연 측정값 제공

## 8. 설정/버전 요구사항

GCS는 연결된 드론 시스템이 어떤 기능을 지원하는지 알아야 한다.

필수 응답:

- `system_name`
- `system_version`
- `git_commit`
- `config_version`
- `supported_modes[]`
- `supported_commands[]`
- `supported_output_backends[]`

추가로 필요:

- 현재 활성 config 전체 조회
- 기본값 대비 override 조회
- 설정 적용 시 diff 결과

## 9. 인터페이스 형태 제안

구현체는 드론 시스템 개발자가 선택해도 되지만, 아래 분리는 유지되어야 한다.

### 9.1 권장 채널

- Telemetry stream: WebSocket 또는 UDP stream
- Command API: HTTP/gRPC/WebSocket RPC 중 하나
- Video stream: RTSP/WebRTC 중 하나
- Log export: 파일 다운로드 또는 세션 fetch API

### 9.2 최소 계약 원칙

- 메시지는 JSON 또는 protobuf처럼 명확한 스키마 사용
- 모든 메시지에 version 포함
- timestamp는 monotonic 기준과 wall-clock 기준 중 하나를 명확히 정의
- 단위는 필드명에서 드러나야 함

## 10. 드론 시스템 개발팀 회신 요청 항목

아래 항목에 회신이 와야 GCS 설계를 확정할 수 있다.

1. 외부 텔레메트리 인터페이스를 무엇으로 제공할 것인지
2. 외부 명령 인터페이스를 무엇으로 제공할 것인지
3. `v2` 상태 머신을 외부 계약으로 고정할 수 있는지
4. FC telemetry와 controller telemetry를 분리해서 줄 수 있는지
5. failsafe 이유 코드를 어떤 목록으로 고정할 것인지
6. 비디오 스트림과 추적 메타데이터를 어떻게 동기화할 것인지
7. 세션 로그를 어떤 포맷으로 저장하고 내보낼 것인지
8. 설정 변경의 적용 시점과 rollback 방법을 어떻게 할 것인지

## 11. GCS 개발 시작 조건

아래 세 가지가 준비되면 GCS 초기 개발을 시작할 수 있다.

1. 텔레메트리 샘플 payload
2. 명령 API 초안
3. 상태 머신 및 이벤트 코드 목록

이 세 가지가 없으면 GCS는 화면만 만들고 실제 운용 로직은 붙일 수 없다.
