# ATD v2 상태 머신 명세

**작성일**: 2026-03-09
**스키마 버전**: `0.1.0`
**대상 문서**: `gcs-followup-request.md` 5절

---

## 1. 상태 목록

| 상태 | 설명 | GCS 표시 색상 |
|------|------|---------------|
| `manual` | 조종자 직접 제어, AI 미개입 | 회색 |
| `search` | 트래킹 ON, 타겟 탐색 중 | 파란색 |
| `track_cruise` | 안정 추적 비행 (pitch/yaw 기반) | 초록색 |
| `track_dive` | 하강 추적 (roll 기동 포함, 고속) | 초록색 강조 |
| `track_continuation` | 타겟 상실 직후, 직전 guidance 유지 | 주황색 |
| `reacquire` | 타겟 재감지, 동일 타겟 검증 중 | 주황색 |
| `target_switch_verify` | 새 타겟 후보 검증 중 | 주황색 |
| `abort_recover` | 안전 위반 또는 추적 실패, 복귀 중 | 빨간색 |
| `failsafe` | 시스템 오류, 전 채널 조종자 직통 | 빨간색 강조 |

---

## 2. 상태 전이 테이블

### 2.1 외부 명령 전이

| From | To | 트리거 | 조건 |
|------|----|--------|------|
| `manual` | `track_cruise` | `start_tracking` 또는 `set_requested_mode(track_cruise)` | not failsafe |
| `manual` | `search` | `set_requested_mode(search)` | not failsafe |
| `manual` | `track_dive` | `set_requested_mode(track_dive)` | not failsafe, `enable_dive_mode=true` |
| `track_cruise` | `manual` | `stop_tracking` 또는 `set_requested_mode(manual)` | 항상 허용 |
| `track_dive` | `manual` | `stop_tracking` 또는 `set_requested_mode(manual)` | 항상 허용 |
| `search` | `manual` | `stop_tracking` 또는 `set_requested_mode(manual)` | 항상 허용 |
| `failsafe` | `manual` | `reset_failsafe_latch` | failsafe 원인 해소 |
| ANY | `manual` | 조종자 전 축 override | 항상 (최우선) |

### 2.2 자동 전이

| From | To | 조건 | reason_code |
|------|----|------|-------------|
| `track_cruise` | `track_continuation` | target confidence ≤ 0 | `target_lost` |
| `track_dive` | `track_continuation` | target confidence ≤ 0 | `target_lost` |
| `track_continuation` | `reacquire` | target 재감지 (confidence > 0) | `target_visible_again` |
| `track_continuation` | `abort_recover` | blind_time > max_blind_cruise_ms (400ms) 또는 max_blind_dive_ms (250ms) | `blind_timeout` |
| `reacquire` | `track_cruise` | continuity_score ≥ same_target_threshold (0.72) | `same_target_cruise` |
| `reacquire` | `track_dive` | continuity_score ≥ 0.72 + dive context | `same_target_dive` |
| `reacquire` | `target_switch_verify` | score ≥ switch_candidate_threshold (0.55), score < 0.72 | `switch_candidate` |
| `reacquire` | `abort_recover` | reacquisition policy abort | `reacquire_abort` |
| `target_switch_verify` | `track_cruise` | candidate_frames ≥ min_candidate_frames (4) | `switch_confirmed` |
| `target_switch_verify` | `abort_recover` | reacquisition policy abort | `switch_abort` |
| `track_dive` | `track_cruise` | `enable_dive_mode=false` | `dive_disabled` |
| ANY | `failsafe` | failsafe_reasons 비어있지 않음 | `failsafe` |

---

## 3. 전이 다이어그램

```
                         ┌─────────────────────────────────────────────┐
                         │            ANY state                        │
                         │  failsafe_reasons → FAILSAFE               │
                         │  pilot all-axis override → MANUAL          │
                         └─────────────────────────────────────────────┘

  ┌────────┐  start_tracking   ┌──────────────┐
  │ MANUAL │ ────────────────> │ TRACK_CRUISE │
  │        │ <──────────────── │              │
  └────────┘  stop_tracking    └──────┬───────┘
       │                              │ target lost
       │                              v
       │                       ┌──────────────────┐
       │                       │TRACK_CONTINUATION │
       │                       └────┬────────┬─────┘
       │                            │        │
       │               target seen  │        │ blind timeout
       │                            v        v
       │                     ┌───────────┐  ┌───────────────┐
       │                     │ REACQUIRE │  │ ABORT_RECOVER │
       │                     └──┬──┬──┬──┘  └───────────────┘
       │                        │  │  │
       │          same target ──┘  │  └── abort
       │          (≥0.72)          │
       │             │             │ switch candidate
       │             v             v (0.55~0.72)
       │      ┌──────────────┐  ┌─────────────────────┐
       │      │ TRACK_CRUISE │  │ TARGET_SWITCH_VERIFY │
       │      │ (or DIVE)    │  └──────────┬───────────┘
       │      └──────────────┘             │
       │                          confirmed │ (≥4 frames)
       │                                   v
       │                            ┌──────────────┐
       │                            │ TRACK_CRUISE │
       │                            └──────────────┘
       │
       │  set_mode(track_dive)   ┌────────────┐
       └───────────────────────> │ TRACK_DIVE │
            (enable_dive=true)   └────────────┘
```

---

## 4. 상태별 상세

### 4.1 `manual`

| 항목 | 값 |
|------|-----|
| 진입 조건 | 시스템 시작 시 기본 상태, `stop_tracking`, 조종자 전축 override, `reset_failsafe_latch` |
| 종료 조건 | `start_tracking` 또는 `set_requested_mode` 명령 |
| AI 제어 | 없음. 전 채널 조종자 직통 |
| GCS 허용 명령 | `start_tracking`, `set_requested_mode`, `arm`, `disarm` |
| operator guidance | "대기 중. 추적을 시작하려면 Tracking Start를 누르세요." |

### 4.2 `search`

| 항목 | 값 |
|------|-----|
| 진입 조건 | `set_requested_mode(search)` |
| 종료 조건 | 타겟 감지 시 자동 전이 (미구현, 현재 외부 mode 변경 필요), `stop_tracking` |
| AI 제어 | 저속 yaw scan (15 dps), 고정 throttle |
| GCS 허용 명령 | `stop_tracking`, `set_requested_mode` |
| operator guidance | "타겟 탐색 중..." |

### 4.3 `track_cruise`

| 항목 | 값 |
|------|-----|
| 진입 조건 | `start_tracking`, 동일 타겟 재획득, 타겟 전환 확정 |
| 종료 조건 | 타겟 상실 (→ continuation), `stop_tracking`, pilot override |
| AI 제어 | pitch/yaw 추적. bank 보조. throttle 0.65 고정 |
| GCS 허용 명령 | `stop_tracking`, `set_requested_mode(track_dive)` |
| operator guidance | "타겟 추적 중 (cruise)" |

### 4.4 `track_dive`

| 항목 | 값 |
|------|-----|
| 진입 조건 | `set_requested_mode(track_dive)` + `enable_dive_mode=true` |
| 종료 조건 | 타겟 상실, `stop_tracking`, pilot override, `enable_dive_mode=false` |
| AI 제어 | roll 기동 포함 추적, throttle 0.75, 공격적 게인 |
| GCS 허용 명령 | `stop_tracking`, `set_requested_mode(track_cruise)` |
| operator guidance | "하강 추적 중 (dive) — 고도 주시" |

### 4.5 `track_continuation`

| 항목 | 값 |
|------|-----|
| 진입 조건 | track 중 target confidence ≤ 0 (자동) |
| 종료 조건 | 타겟 재감지 (→ reacquire), blind 시간 초과 (→ abort_recover) |
| AI 제어 | 직전 guidance snapshot 유지 후 decay. hold 250ms → decay 250ms |
| GCS 허용 명령 | `stop_tracking` |
| 자동 전이 시한 | cruise: 400ms, dive: 250ms |
| operator guidance | "타겟 상실 — 직전 경로 유지 중 (N ms)" |

### 4.6 `reacquire`

| 항목 | 값 |
|------|-----|
| 진입 조건 | continuation 중 타겟 재감지 (자동) |
| 종료 조건 | 동일 타겟 확인 (→ track), 전환 후보 (→ switch_verify), abort |
| AI 제어 | 보수적 게인으로 추적 (bank 25°, pitch 15°) |
| GCS 허용 명령 | `stop_tracking` |
| operator guidance | "타겟 재획득 검증 중 (score: N.NN)" |

### 4.7 `target_switch_verify`

| 항목 | 값 |
|------|-----|
| 진입 조건 | reacquire에서 switch candidate 판정 (자동) |
| 종료 조건 | candidate_frames ≥ 4 (→ track_cruise), abort |
| AI 제어 | 최소 게인으로 추적 (bank 20°, pitch 10°) |
| GCS 허용 명령 | `stop_tracking` |
| operator guidance | "새 타겟 후보 검증 중 (N/4 프레임)" |

### 4.8 `abort_recover`

| 항목 | 값 |
|------|-----|
| 진입 조건 | blind timeout, reacquire abort, switch abort, envelope abort (자동) |
| 종료 조건 | 현재 자동 복귀 미구현. `stop_tracking`으로 manual 전환 필요 |
| AI 제어 | 없음. 안전 복귀 경로 (미구현, 현재 neutral 명령) |
| GCS 허용 명령 | `stop_tracking`, `set_requested_mode(manual)` |
| operator guidance | "추적 중단 — 안전 복귀 중. 수동 조종 권장." |

### 4.9 `failsafe`

| 항목 | 값 |
|------|-----|
| 진입 조건 | failsafe_reasons 비어있지 않음 (최우선, 어떤 상태에서든) |
| 종료 조건 | `reset_failsafe_latch` + 원인 해소 |
| AI 제어 | 없음. 전 채널 조종자 직통 |
| GCS 허용 명령 | `reset_failsafe_latch`, `disarm` |
| operator guidance | "FAILSAFE — [원인]. 수동 조종하세요." |

---

## 5. 우선순위 규칙

전이 판정 시 아래 순서로 평가. 상위가 하위를 무조건 덮어쓴다.

```
1. FAILSAFE       ← failsafe_reasons 존재 (최우선)
2. MANUAL          ← 조종자 전 축 override
3. 자동 전이       ← mode_manager 판정 (target loss, blind timeout 등)
4. GCS 명령        ← set_requested_mode, start/stop_tracking
5. 현재 상태 유지   ← 아무 조건도 해당 안 되면 현 모드 유지
```

GCS 명령이 자동 전이(3번)보다 낮은 우선순위임에 주의. 예를 들어 GCS가 `track_cruise`를 요청해도, 타겟이 없으면 시스템이 자동으로 `track_continuation`으로 전이한다.

---

## 6. GCS 버튼 활성화 조건 요약

| 버튼 | 활성 조건 |
|------|-----------|
| Start Tracking | `manual` 또는 `search` 상태 |
| Stop Tracking | `manual`, `failsafe` 이외 모든 상태 |
| Switch to Dive | `track_cruise` + `enable_dive_mode=true` |
| Switch to Cruise | `track_dive` |
| Reset Failsafe | `failsafe` 상태 |
| Arm | `manual` + not armed |
| Disarm | armed 상태 |
