# ATD_GCS 핵심 기능 기준

- 작성일: `2026-03-09`
- 문서번호: `002`

## 목적

이 문서는 `ATD_GCS`가 단순 ATD 상태 패널이 아니라, 실제 Ground Control Station으로 갖춰야 할 기본 기능을 정의한다.

기준 참고는 QGroundControl 공식 사용자 문서의 핵심 뷰와 운용 기능이다.

## 참고 기준

QGroundControl 공식 문서 기준으로, GCS의 기본 축은 아래 5개다.

1. Fly View
2. Plan View
3. Setup View
4. Analyze Tools
5. Main Toolbar / Vehicle Status

## ATD_GCS 필수 기능

### 1. Fly View

가장 우선 구현해야 하는 핵심 운용 화면이다.

필수 기능:

- 현재 기체 상태 실시간 표시
- arm/disarm
- 현재 flight mode 표시 및 변경
- failsafe / warning / vehicle message 표시
- 지도 또는 비디오 중심 메인 뷰
- 자세/방위/기본 계기 패널
- 추적 상태 표시
- ATD 전용 명령 버튼

ATD_GCS 추가 요구:

- `controller_mode`와 `requested_mode` 분리 표시
- target lost / reacquire / switch verify 상태 강조
- output failure / frame timeout / heartbeat loss 즉시 표시

### 2. Plan View

QGC처럼 미션, 지오펜스, 홈 기준 계획 기능은 GCS의 기본 범주로 본다.

필수 기능:

- 지도 기반 경로 표시
- planned home 표시
- mission upload/download 자리 확보
- geofence / safety area 표시 자리 확보

초기 ATD_GCS 범위:

- 완전한 mission editor까지는 보류 가능
- 하지만 Plan View 라우트와 지도 영역 구조는 초기에 잡아야 한다

### 3. Setup View

운용 전 기체 준비 상태를 확인하고 기본 설정을 보는 화면이 필요하다.

필수 기능:

- 연결 상태 요약
- 센서/링크/전원/비디오 입력 상태 요약
- failsafe 관련 설정 상태
- mode capability 요약
- ATD 추적 관련 capability 요약

초기 ATD_GCS 범위:

- 설정 변경 UI는 보류 가능
- 읽기 전용 setup summary는 초기부터 필요

### 4. Analyze View

실제 GCS는 운용 후 분석 기능이 있어야 한다.

필수 기능:

- 이벤트 로그 보기
- telemetry 기록 보기
- 세션 목록 보기
- export/download 자리 확보

초기 ATD_GCS 범위:

- 실시간 event panel은 이미 우선순위 높음
- 이후 세션 로그/리플레이 화면으로 확장

### 5. Main Toolbar

상단 툴바는 단순 제목줄이 아니라 기체 상태 허브여야 한다.

필수 항목:

- 연결 상태
- arm 상태
- FC mode
- battery
- GPS 또는 대체 위치 상태
- RC link
- telemetry link
- vehicle messages
- 현재 active vehicle / session

ATD_GCS 추가 항목:

- tracker mode
- target lock 상태
- failsafe state

## 1차 구현 우선순위

### P0

- Main Toolbar
- Fly View
- Event/Alert 시스템
- Vehicle messages
- 기본 command panel

### P1

- Setup Summary View
- Analyze View
- session log list
- video panel placeholder

### P2

- Plan View
- mission/geofence integration
- replay / export

## 현재 프로젝트에 대한 수정 방향

현재 mock 대시보드는 단일 페이지 상태 모니터에 가깝다.
이를 아래 구조로 확장하는 방향이 맞다.

- `Fly`
- `Plan`
- `Setup`
- `Analyze`

즉 다음 단계부터는 단일 대시보드를 키우는 방식보다, QGC처럼 상위 뷰 구조를 먼저 도입해야 한다.

## 결론

ATD_GCS는 아래 성격을 가져야 한다.

- 드론 운용용 기본 GCS
- 그 위에 ATD 전용 추적 기능이 얹힌 형태

즉 "ATD 전용 패널"이 아니라 "기본 GCS + ATD 추적 확장"으로 설계해야 한다.
