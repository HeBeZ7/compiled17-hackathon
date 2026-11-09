# D 인계 — 선생님 상담·학습 화면

2026-11-09 · 브랜치 `aa/d-learning` · 기반 `7a81abd`

## Redesign update (branch `aa/redesign-d`, base `7aa3347`, feature commit `9a9e357`)

R-028 and R-029 for the teacher and learning dialogs  This supersedes the Korean labels named below

Accessible names for F

| Element | Before | Now |
| --- | --- | --- |
| Teacher dialog | 선생님 상담 | Talk to your teacher |
| Learning dialog | 학습 준비 | Learning station |
| Close button | 닫기 | Close |
| Step regions | 1. 학습 자료 to 5. 학습 요청 | Step 1 · Training data, Step 2 · Training method, Step 3 · Price check, Step 4 · Cost limit and conditions, Step 5 · Training request |
| Run regions | 학습 상태, 결과 상태, 내 학습 기록 | Training status, Result status, My training runs |
| Price button | 가격 조회, 가격 다시 조회 | Check price, Check price again |
| Validate button | 서버에서 조건 확인 | Check conditions on server |
| Limit fields | 통화 (예: USD), 실행 비용 한도 | Currency (such as USD), Run cost limit |
| Submit button | 실제 학습 요청 | Request real training |
| Validation badge | 조건 통과, 준비 필요 | Conditions passed, Needs preparation |

All `data-testid` values are unchanged  A null price renders `Unknown · not free`

Verification

- `npm run verify` passed on the feature commit
- Chromium at 1280x800 and 390x844 through an uncommitted harness page over a concept image  Not the real classroom canvas, and opening from the classroom was not exercised
- The real server path covered agent save and the teacher `NOT_CONNECTED` response  Teacher reply, price and run screens used `page.route` doubles
- Checked: no input and control overlap, no horizontal scroll, Escape closes, blur off under `prefers-reduced-transparency`

Requests for A

- `src/shared/ui/ConnectionNotice.tsx` and the connection badge still show Korean inside these dialogs: 연결 필요, 준비 필요, 상태 불명, 문제 발생, 필요한 설정, 다시 시도, 테스트 대역

## 담당 요구와 기능 커밋

R-011, R-012, R-013·R-014의 화면, BUILD_PLAN §8의 상태 표시를 담당한다.

| 커밋 | 내용 |
| --- | --- |
| `1210da8` | 상담 서비스, 추천 근거 검증, 상담 패널 |
| `37e91ec` | 학습 자료, 가격, 비용 승인, 학습 요청과 복구, 상태·결과 화면 |

변경 경로는 `src/features/teacher/**`, `src/features/learning/**`, `src/server/teacher/**`, 이 문서뿐이다.

## 구현 동작

**상담**

- 서버가 저장된 프로필로 학생 모델을 정한다. 프로필 버전이나 모델이 요청과 다르면 `CONFLICT`로 거부하고 LLM을 호출하지 않는다.
- 교사 모델과 학생 모델을 프롬프트, 응답, 화면에서 분리한다.
- LLM이 인용한 근거는 서버가 만든 근거 목록의 번호로만 연결한다. 없는 번호는 버린다.
- 대안 모델은 카탈로그 조회로 확인되고 출처·과제·평가셋이 있는 점수 또는 지원 근거가 있어야 남는다. 아니면 추천에서 제외하고 그 사실을 표시한다.
- 같은 조건의 점수가 없으면 직접 비교할 수 없다는 한계를 서버가 붙인다.
- 추천은 프로필을 바꾸지 않는다. 사용자가 모델 선택 화면에서 직접 바꾼다.
- 고정 환영 문구는 `고정 안내 · 모델 응답 아님`, 실제 응답은 `AI 응답 · <교사 모델>`로 표시한다. LLM 미연결이면 고정 답변을 만들지 않고 `연결 필요`를 표시한다.
- 요청 취소, 패널 닫기, 프로필 변경은 대기 중 요청을 중단한다. 늦은 응답은 버린다. 모델이 바뀌면 새 상담으로 시작한다.

**학습**

- 순서: 자료 저장 → 방식 → 가격 조회 → 비용 한도 → 서버 조건 확인 → 사용자 승인 → 요청.
- 가격 조회 실패나 단가 `null`은 `미확인`이며 `무료가 아님`을 표시하고, 요청을 막는다. 값 0은 실제 0으로 표시한다.
- 방식, 시간, 한도, 프로필이 바뀌면 가격 또는 조건 확인과 승인을 무효화한다.
- 요청 전 `requestKey`와 spec을 localStorage에 저장한다. 저장에 실패하면 요청하지 않는다.
- 결과가 불명인 생성 오류는 실패로 표시하지 않고 자동 재전송하지 않는다. 서버 목록에서 같은 키를 찾고, 없을 때만 사용자가 같은 키로 다시 보낼 수 있다.
- 끝나지 않은 학습이나 결과 불명 요청이 있으면 새 유료 요청을 막는다.
- 조회 실패는 마지막 관측 상태를 유지하고 조회 오류만 따로 보여 준다. `status_unknown`은 생성 결과 불명에 쓰는 공통 규칙(`3da15f3`)과 일치한다.
- 취소는 `취소 요청됨`과 `취소 확인됨`을 구분한다.
- 학습, 결과물, 실제 사용, 성능 평가를 독립된 네 항목으로 표시한다. 진행률이나 타이머 애니메이션은 없다.

**이동 잠금**

패널이 열리면 A의 `selectMovementLocked`로 이동이 멈춘다. 닫을 때 `useDialogBehavior`가 입력 포커스 잠금을 해제해, 포커스된 입력창이 사라져도 이동이 멈춘 채 남지 않게 한다.

## F·통합용 접점

- 상담 대화창: role `dialog`, 이름 `선생님 상담`, `닫기` 버튼. 학습 대화창: 이름 `학습 준비`.
- testid: `teacher-input`, `price-panel`, `training-start`, `run-status`(`data-status`에 현재 상태), `pending-request`, `connection-notice`.
- run 표시: `학습 자리 열기`로 패널을 열면 `api.training.list()`에서 현재 에이전트의 진행 중인 최신 run을 자동 표시한다. 끝난 run은 `내 학습 기록`의 항목을 눌러 연다. A의 `ClassroomScreen` 변경은 필요 없다.
- LLM 주입: `askTeacherWith({ completeChat }, input, ctx)`. 라우트의 `askTeacher(input, ctx)`는 그대로다.

## 검증 결과

| 항목 | 결과 |
| --- | --- |
| `npm run verify` | 통과. 단위 테스트 72건(D 61건, A 기반 11건) |
| `npm run build` | 통과 |
| 브라우저(Chromium, 개발 서버 3003), 실제 D 서버 경로 | 1280px·390px 각 18항목 통과. 에이전트 실제 저장, 현재 모델 표시, 이동 잠금·복원, Escape·닫기, 입력창과 조작부 겹침 없음, 가로 스크롤 없음, LLM·가격 미연결 시 `NOT_CONNECTED` |
| 브라우저, `page.route` 대역 | 21항목 통과. 응답 표시, 추천·근거, `javascript:` 링크 차단, 요청 취소, 가격 불명, 승인, 학습 요청, 취소 요청, 조회 오류, 완료+로드 실패, 결과 불명과 새로고침 복구 |

재현: 단위 검증은 `npm run verify`. 브라우저 검사 스크립트는 저장소 밖 임시 파일이어서 인계되지 않는다. 대역은 그 스크립트에만 있고 제품 코드에는 없다. 마지막 CSS 수정(안내 상자 폭) 이후에는 빌드만 다시 했고 브라우저 검사는 다시 하지 않았다.

## 실제 / 대역 / 미연결

| 경로 | 상태 |
| --- | --- |
| 에이전트 저장·조회 | 실제 저장 계층 |
| 교사 LLM, 카탈로그, 가격, 학습, 결과물, 추론 | E의 `7a81abd` 뼈대 기준 미연결(`NOT_CONNECTED`) |
| 위 경로의 성공 화면 | 브라우저 대역으로만 확인 |

A-07, A-08, A-09~11은 **미통과·미실행**이다. 실제 교사 응답, 실제 가격, GPU 학습, 결과 모델 응답은 확인하지 못했다. 유료 작업은 실행하지 않았다.

수정된 기준 이미지를 받지 못해 **이미지 비교는 미실행**이다. 색은 `tokens.ts`의 값만 사용했다.

## A·E 요청

**A (통합 때 반영)**

1. 학습 자료 조회 API. 지금은 저장 후 검증 상태를 갱신하거나 새로고침 후 자료를 복원할 수 없다. 새로고침 뒤에는 파일을 다시 올려야 한다.
2. `TrainingSpec.config` 규격. E의 어댑터 규격이 나올 때까지 `{}`를 보낸다. 서버 검증이 거부하면 `준비 필요`와 사유를 표시한다.

**E**

1. `getPriceQuote`는 `provider: null` 요청에 실제 사용할 공급자를 `PriceQuote.provider`로 돌려줘야 한다. 화면에 공급자 선택 목록이 없고 이 값을 `TrainingSpec.provider`로 쓴다.
2. `createTrainingRun`은 같은 `requestKey`와 같은 spec에 기존 run을 반환해야 한다. 사용자의 재전송이 이 동작에 의존한다.
3. `completeChat`에는 구조화 출력 옵션이 없어 JSON 형식을 시스템 프롬프트로 요청한다. 형식을 어긴 응답은 추천 없는 일반 답변으로 표시한다.
4. 생성 호출이 공급자에 도달했을 수 있으면 `STATUS_UNKNOWN`을 돌려줘야 한다. 화면은 `NOT_CONNECTED`, `INVALID_REQUEST`, `NOT_FOUND`, `CONFLICT`, `UNSUPPORTED`, `BLOCKED`, `PAYLOAD_TOO_LARGE`, `RATE_LIMITED`를 공급자 호출 전 거부로 보고 요청 기록을 지운다.

## 남은 제약

- 대화 내용과 학습 준비 입력은 페이지 메모리에만 있어 새로고침하면 사라진다. 결과 불명 요청과 run 기록은 복원된다.
- 답변 본문의 사실은 서버가 검증하지 못한다. 시스템 프롬프트로 금지하고, 구조화된 추천의 근거만 서버가 검증한다.
- `status_unknown`이 끝나지 않으면 같은 에이전트의 새 요청이 계속 막힌다. 중복 과금 방지를 우선한 선택이다.
- 다음 단계: E 연결 후 실제 교사 응답과 가격으로 A-07·A-08을 검증한다.
