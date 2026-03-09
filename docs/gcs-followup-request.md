# ATD v2 GCS 연동 후속 요청사항

## 목적

이 문서는 `gcs-interface-response.md` 회신 이후, GCS 초기 개발 착수를 위해 드론 시스템 개발팀에 추가로 요청하는 항목을 정리한다.

회신 방향은 전반적으로 적절하다. 다만 현재 상태로는 인터페이스 방향만 합의된 수준이며, GCS 구현에 필요한 외부 계약이 아직 충분히 고정되지 않았다.

이 문서의 목적은 아래 세 가지를 조속히 확정하는 것이다.

- 샘플 payload
- 명령/이벤트 스키마
- 상태/실패 코드 계약

## 우선 요청 결론

GCS 초기 개발을 시작하려면 아래 3개 산출물이 우선 필요하다.

1. `vehicle`, `tracker`, `health` 텔레메트리 샘플 JSON payload
2. 명령 RPC 스키마 초안
3. 상태 전이 이벤트 코드와 failsafe 코드 목록

이 3개가 오면 GCS는 화면 구조, 상태 스토어, RPC 계층, 이벤트 패널 구현을 시작할 수 있다.

## 1. 텔레메트리 샘플 payload 요청

다음 3개 메시지의 샘플 JSON을 요청한다.

### 1.1 Vehicle Telemetry 샘플

요청 채널:

- `/ws/telemetry/vehicle`

최소 포함 필드:

- `schema_version`
- `timestamp`
- `sequence`
- `link_ok`
- `armed`
- `flight_mode_fc`
- `roll_deg`
- `pitch_deg`
- `yaw_rate_dps`
- `altitude_agl_m`
- `battery_voltage`
- `battery_remaining_pct`
- `rc_link_ok`
- `video_link_ok`

추가 요청:

- 필드별 타입
- 단위
- nullable 여부
- 갱신 주기 목표값

### 1.2 Tracker Telemetry 샘플

요청 채널:

- `/ws/telemetry/tracker`

최소 포함 필드:

- `schema_version`
- `timestamp`
- `sequence`
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
- `failsafe_reasons`
- `output_backend`
- `output_send_ok`
- `output_failure_count`

권장 포함 필드:

- `predicted_center_x_norm`
- `predicted_center_y_norm`
- `image_velocity_x`
- `image_velocity_y`
- `scale_rate`
- `last_envelope_clipped_axes`
- `frame_timestamp`

### 1.3 Health Telemetry 샘플

요청 채널:

- `/ws/telemetry/health`

최소 포함 필드:

- `schema_version`
- `timestamp`
- `mavlink_connected`
- `mavlink_latency_ms`
- `frame_rate_ok`
- `frame_latency_ms`
- `control_rate_ok`
- `control_loop_ms`
- `detector_ok`
- `tracker_ok`
- `storage_ok`

## 2. 명령 RPC 스키마 요청

회신에서 WebSocket RPC(JSON) 방향은 합의되었으므로, 이제 명령별 계약을 고정해야 한다.

### 2.1 공통 요청 포맷

아래 항목을 포함한 공통 요청/응답 포맷 초안을 요청한다.

요청:

- `schema_version`
- `request_id`
- `command`
- `params`
- `timestamp`

응답:

- `schema_version`
- `request_id`
- `status`
- `result`
- `error`
- `timestamp`

### 2.2 우선 명령 목록

초기 GCS에서 우선 필요한 명령은 아래다.

- `set_requested_mode`
- `start_tracking`
- `stop_tracking`
- `arm`
- `disarm`
- `reset_failsafe_latch`

각 명령별로 아래를 요청한다.

- `params` 구조
- 성공 응답 예시
- 실패 응답 예시
- `error.code` 목록
- 동기/비동기 여부
- 실제 적용 시점

### 2.3 `set_requested_mode` 상세 요청

이 명령은 초기 GCS에서 가장 중요하므로 아래를 명확히 요청한다.

- 허용 가능한 mode enum 전체
- 현재 상태에서 허용되지 않는 mode 요청 시 오류 코드
- mode 변경이 즉시 적용되는지, 다음 제어 주기부터 적용되는지
- `TRACK_DIVE` 비활성 상황에서의 응답 방식
- failsafe 중 mode 요청 시 처리 방식

## 3. 이벤트 코드 계약 요청

GCS는 polling만으로 운용 UI를 만들 수 없으므로 이벤트 스트림 계약이 필요하다.

### 3.1 이벤트 공통 포맷

아래 공통 필드를 포함한 이벤트 JSON 예시를 요청한다.

- `schema_version`
- `event_id`
- `timestamp`
- `sequence`
- `severity`
- `code`
- `message`
- `context`

### 3.2 필수 이벤트 목록

아래 이벤트 코드 목록과 각 payload 예시를 요청한다.

- `mode_changed`
- `failsafe_entered`
- `failsafe_cleared`
- `target_lost`
- `target_reacquired`
- `output_send_failed`
- `operator_override_detected`
- `heartbeat_lost`
- `frame_timeout`

### 3.3 `mode_changed` 상세 요청

`mode_changed`는 GCS 상태 배지와 타임라인에 직접 사용되므로 아래를 포함해야 한다.

- `previous_mode`
- `current_mode`
- `reason_code`
- `requested_mode`
- `trigger_source`

## 4. failsafe 코드 Enum 요청

회신 문서에서 후보 목록은 제시되었으나, GCS 구현을 위해서는 고정된 enum과 의미 정의가 필요하다.

다음 항목을 요청한다.

- 최종 failsafe code enum 목록
- 각 코드의 의미
- 각 코드의 발생 계층
- 자동 복구 가능 여부
- GCS 표시 severity

최소한 아래 후보들의 확정 여부를 요청한다.

- `output_send_failed`
- `blind_timeout`
- `low_altitude_margin`
- `continuation_bank_limit`
- `reacquire_abort`
- `switch_abort`
- `mavlink_heartbeat_lost`
- `video_frame_timeout`
- `detector_failure`
- `rc_link_lost`

## 5. 상태 머신 명세 요청

9개 mode enum은 합의되었지만, GCS 버튼 활성화와 전이 안내를 위해 전이 조건을 더 명확히 받아야 한다.

요청 항목:

- 상태 전이 테이블
- 각 상태의 진입 조건
- 각 상태의 종료 조건
- 자동 전이 조건
- 수동 명령 허용 여부
- 각 상태에서 표시해야 할 operator guidance 문구

특히 아래 전이에 대한 명시를 요청한다.

- `MANUAL -> TRACK_CRUISE`
- `TRACK_CRUISE -> TRACK_DIVE`
- `TRACK_CRUISE -> TRACK_CONTINUATION`
- `TRACK_CONTINUATION -> REACQUIRE`
- `REACQUIRE -> TRACK_CRUISE`
- `REACQUIRE -> TARGET_SWITCH_VERIFY`
- `TARGET_SWITCH_VERIFY -> TRACK_CRUISE`
- `ANY -> FAILSAFE`

## 6. 비디오 오버레이 동기화 요청

비디오 스트림은 P1로 미뤄도 되지만, GCS 화면 구조를 위해 최소 계약은 먼저 필요하다.

요청 항목:

- 비디오 채널 방식 초안: `RTSP` 또는 `WebRTC`
- `frame_timestamp` 기준 정의
- video PTS와 metadata timestamp의 매칭 방식
- bbox 좌표 표현 방식
- target 식별자 필드 제공 여부

## 7. 버전 관리 요청

초기부터 스키마 호환성을 관리해야 하므로 아래를 요청한다.

- telemetry schema version
- command schema version
- event schema version
- system version
- git commit

각 메시지에 `schema_version`을 포함할지 여부도 확정 요청한다.

## 8. 회신 요청 형식

아래 형식 중 하나로 회신을 요청한다.

1. 샘플 JSON payload 3종 + 명령 예시 3종 + 이벤트 예시 3종
2. 또는 OpenAPI/JSON Schema/Markdown 표 중 하나로 스키마 문서화

가능하면 `docs/` 아래에 아래 파일명으로 제공 요청한다.

- `gcs-telemetry-samples.md`
- `gcs-command-schema.md`
- `gcs-event-codes.md`
- `gcs-state-machine.md`

## 9. GCS 개발팀 입장 정리

현재 회신만으로도 GCS 아키텍처 방향 설정은 가능하다.
하지만 실제 구현에 들어가려면 메시지 예시와 코드 목록이 먼저 필요하다.

따라서 드론 시스템 개발팀에는 다음 순서로 산출물을 요청한다.

1. 텔레메트리 샘플 JSON
2. 명령 RPC 스키마
3. 이벤트/실패 코드 목록
4. 상태 전이 테이블

이 순서가 맞아야 GCS 쪽에서 mock server, 상태 스토어, UI 컴포넌트, 이벤트 패널을 병행 개발할 수 있다.
