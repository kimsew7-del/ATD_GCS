# ATD_GCS v2 저장소 기준 대응 업데이트

- 작성일: `2026-03-09`
- 문서번호: `004`

## 목적

이 문서는 `https://github.com/kimsew7-del/Auto-Tracking-Drone/tree/v2`의 현재 `v2` 브랜치 구조와 코드를 다시 확인한 뒤, `ATD_GCS`에서 추가 대응이 필요한 항목을 정리한다.

이번 확인 기준은 외부 회신 문서만이 아니라 실제 저장소 코드와 최신 아키텍처 문서다.

## 확인 기준

- `docs/2026-03-09_v2_airframe_strike_refactor_summary.md`
- `src/v2/types.py`
- `src/v2/runtime/app.py`
- `src/v2/runtime/state.py`
- `src/v2/runtime/runner.py`
- `docs/gcs/README.md`

## 핵심 변경과 GCS 대응

### 1. `strike` 모드 대응 추가

저장소 코드에는 `ControlModeV2.STRIKE`가 이미 존재한다.

대응:

- `supported_modes`에 `strike`가 오면 즉시 버튼과 상태 배지에 반영
- Fly View 명령 패널에 `Switch to Strike` 자리 확보
- `controller_mode == strike`일 때 별도 강조 색상과 operator guidance 표시
- Analyze View에서 strike 진입/종료 이벤트를 세션 전환 포인트로 기록

### 2. `vehicle_type` 대응 추가

`fixed_wing`과 `multicopter`가 1급 설정으로 분리됐다.

GCS 대응:

- Setup View에 `vehicle_type` 표시
- Fly View 상단에 현재 airframe 표시
- airframe별 운용 안내 문구 분기
- 향후 HUD와 계기 범위를 airframe별로 다르게 적용할 준비

### 3. `strike_path_hold` 같은 subphase 표시 추가

현재 top-level mode만 보면 `track_continuation`처럼 보이지만, 내부 guidance source는 `strike_path_hold`일 수 있다.

GCS 대응:

- top-level mode 아래에 `guidance_source` 또는 `subphase`를 따로 표시
- `strike_path_hold`일 때 일반 continuation과 다른 경고/안내 표시
- continuation 일반 상태와 strike continuation 상태를 동일 UI로 취급하지 않기

### 4. `last_strike_completion` 대응 추가

런타임은 최근 strike 종료 결과를 `last_strike_completion`으로 보관한다.

이유 enum:

- `ground_proximity`
- `target_passed`

GCS 대응:

- Tracker 또는 Health 패널에 최근 strike completion 표시
- `ground_proximity`는 안전 경고로 취급
- `target_passed`는 작전 종료 또는 재정렬 안내로 취급
- Analyze View 요약에 마지막 strike completion reason 추가

### 5. cycle-time health 표시 추가

런타임 러너는 `last_cycle_duration_ms`를 기록하고 `cycle_time_warn_fraction` 기준 경고를 발생시킨다.

GCS 대응:

- Health 패널에 `last_cycle_duration_ms` 표시
- 제어 주기 예산 초과 시 warning 배지 표시
- frame latency와 control loop budget을 분리해서 보여주기

### 6. 문서 경로 변경 대응

저장소의 GCS 관련 문서는 현재 아래처럼 정리돼 있다.

- `docs/gcs/atd-requested/`
- `docs/gcs/user-authored/`

## GCS 구현 반영 항목

### P0 바로 반영

- `strike` 모드 버튼/배지/상태 텍스트
- `vehicle_type` 표시
- `guidance_source` 또는 subphase 표시 자리
- `last_cycle_duration_ms` health 표시

### P1 반영

- `last_strike_completion` 패널/이벤트 요약
- airframe별 HUD 차등화
- strike 관련 Analyze View 요약 강화

## 구현 원칙 수정

- 외부 문서 enum만 고정해서 거부하지 않는다.
- 서버 `setup` capability와 실제 telemetry 필드를 우선 신뢰한다.
- 문서보다 코드가 앞선 상태가 보이면 GCS는 extension field를 수용 가능하게 구현한다.

## 결론

현재 `v2`는 단순 추적 상태기가 아니라 airframe-aware control stack으로 확장됐다.

따라서 `ATD_GCS`도 이제 아래를 전제로 구현해야 한다.

- mode 중심 UI
- airframe-aware UI
- strike lifecycle UI
- control-loop health UI
