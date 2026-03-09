# ATD_GCS 실연동 요청서

- 작성일: `2026-03-09`
- 문서번호: `001`

## 목적

이 문서는 `ATD_GCS`의 mock transport를 실제 `Auto-Tracking-Drone` 서버 transport로 전환하기 위해 필요한 최종 확인 항목을 정리한다.

현재 GCS 쪽 준비 상태:

- WebSocket transport adapter 구조 준비 완료
- `vehicle`, `tracker`, `health`, `events`, `commands`, `setup` 채널 수용 가능
- 지도/영상 표시용 adapter 계층 준비 완료
- 실좌표 및 bbox 계열 필드가 오면 즉시 반영 가능

즉, 이제 필요한 것은 **실제 서버 payload 명세**와 **영상 공급 방식 확정**이다.

## 요청 항목

### 1. 실제 WebSocket endpoint

아래를 회신 요청한다.

- 실제 WebSocket URL
- 연결 시 인증 필요 여부
- subprotocol 사용 여부
- reconnect 권장 정책

예:

- `ws://<host>:<port>/ws`
- `ws://<host>:<port>/ws/telemetry`

### 2. 실제 메시지 envelope

현재 GCS는 아래 형태를 수용할 준비가 되어 있다.

```json
{
  "channel": "tracker",
  "payload": {}
}
```

실서버가 이 형식을 그대로 쓰는지, 아니면 다른 envelope를 쓰는지 회신 요청한다.

필요 항목:

- envelope 전체 예시
- channel 필드명
- payload 필드명
- command result 응답 형식

### 3. Vehicle payload 실제 필드명

아래 필드의 실제 이름을 회신 요청한다.

- `latitude_deg`
- `longitude_deg`
- `altitude_agl_m`
- `armed`
- `flight_mode_fc`
- `battery_voltage`
- `battery_remaining_pct`
- `rc_link_ok`
- `video_link_ok`

가능하면 샘플 payload 1개 요청:

```json
{
  "channel": "vehicle",
  "payload": { "...": "..." }
}
```

### 4. Tracker payload 실제 필드명

아래 필드의 실제 이름을 회신 요청한다.

- `controller_mode`
- `requested_mode`
- `target_detected`
- `target_confidence`
- `frame_age_ms`
- `failsafe_active`
- `failsafe_reasons`
- `predicted_center_x_norm`
- `predicted_center_y_norm`
- `bbox_x_norm`
- `bbox_y_norm`
- `bbox_w_norm`
- `bbox_h_norm`
- `target_id`
- `frame_timestamp`
- `target_latitude_deg`
- `target_longitude_deg`

가능하면 샘플 payload 2개 요청:

1. 정상 추적 중
2. target lost / failsafe 중

### 5. Event payload 실제 필드명

GCS는 event correlation을 위해 아래를 기대한다.

- `event_id`
- `timestamp`
- `sequence`
- `severity`
- `code`
- `message`
- `context.request_id`

특히 아래 event가 실제로 나오는지 회신 요청:

- `mode_changed`
- `failsafe_entered`
- `failsafe_cleared`
- `command_completed`
- `command_failed`

### 6. Command result payload

실제 command 응답이 아래 형식을 따르는지 확인 요청한다.

```json
{
  "channel": "command_result",
  "payload": {
    "schema_version": "0.1.0",
    "request_id": "uuid",
    "status": "ok",
    "command": "arm",
    "result": {},
    "error": null,
    "timestamp": 0
  }
}
```

확인 요청 항목:

- 동기 응답인지
- command_result 전용 채널인지
- 실패 시 `error.code` 실제 목록

### 7. 영상 공급 방식

GCS는 현재 아래 무료/오픈소스 경로를 준비해두었다.

- MP4 URL
- HLS `.m3u8` URL (`HLS.js`)

실제 운용에서 아래 중 어느 방식을 줄 수 있는지 회신 요청한다.

- HLS URL
- MP4 파일/테스트 클립
- RTSP URL
- WebRTC signaling endpoint

초기 연동은 가장 간단한 아래 둘 중 하나를 권장한다.

1. HLS URL
2. RTSP URL + 별도 브리지

### 8. 영상-메타데이터 동기화

아래 기준을 회신 요청한다.

- 비디오 frame timestamp 기준
- tracker `frame_timestamp` 기준
- bbox가 어느 프레임 기준인지
- target id가 프레임별 유지되는지

### 9. 실연동 최소 세트

GCS 쪽에서 바로 붙일 수 있는 최소 세트는 아래다.

1. 실제 WebSocket URL
2. `vehicle` 샘플 payload 1개
3. `tracker` 샘플 payload 2개
4. `event` 샘플 payload 2개
5. command result 샘플 payload 1개
6. 영상 URL 공급 방식 1개

## 권장 회신 형식

아래 중 하나를 요청한다.

1. `docs/atd-real-transport-samples.md`
2. JSON 파일 샘플 묶음
3. 실제 dev endpoint 정보 + 테스트 자격 증명

## 결론

GCS 쪽 구조는 이미 준비됐다.
실서버 payload와 영상 공급 방식만 확정되면, 다음 단계는 mock 제거가 아니라 **real transport adapter 활성화**다.
