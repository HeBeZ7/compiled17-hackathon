# Agent Academy — F 검증 계획

대상 독자: A~E 담당자. 기준: PRODUCT_SPEC 0.2, BUILD_PLAN 0.2.
기반 커밋 `7a81abd`의 계약(`src/shared/contracts/`)에 맞췄다. `tests/support/ports.ts`의 포트와 testid는 F의 가정이며 제품 계약이 아니다.

## 1. 증거 등급

결과는 아래 등급을 섞어 보고하지 않는다. 낮은 등급의 통과로 높은 등급을 통과 처리하지 않는다.

| 등급 | 의미 | 입증 범위 |
| --- | --- | --- |
| META | F의 참조 구현과 결함 주입 | 테스트의 탐지력만. 제품에 대해 아무것도 입증하지 않음 |
| FIXTURE | 실제 제품 코드 + 공급자/네트워크 대역 | 제품 로직과 UI 표시 |
| BROWSER | 실제 제품 + 실제 브라우저 조작 | 입력·화면·흐름. 공급자 연동은 입증하지 않음 |
| LIVE | 실제 공급자 응답 | 해당 계정·조건의 실제 동작 |

## 2. 사례 목록

| 영역 | 수용 기준 | 사례 | 등급 | 파일 |
| --- | --- | --- | --- | --- |
| 이동·충돌·입력 해제 | A-01~03 | C1~C11 | BROWSER | `tests/e2e/classroom-movement.spec.ts` |
| 외형과 모델 연결 | A-04 | V1~V6 | BROWSER (카탈로그 검색만 대역) | `tests/e2e/avatar-model-link.spec.ts` |
| 말풍선·버튼·가림·겹침 | A-01~03, A-13 일부 | R1~R4, O1, N1~N4 | BROWSER | `tests/e2e/classroom-surface.spec.ts` |
| 모델 변경 후 상담 문맥 | A-06, A-07 일부 | M1~M8 | FIXTURE | `tests/integration/teacher-context.test.ts` |
| 가격 실패·미확인 값 | A-08 일부 | P1~P6, U1~U3 | FIXTURE | `tests/integration/pricing.test.ts`, `tests/e2e/learning-truth.spec.ts` |
| 중복 학습 방지 | A-09~10 일부 | T1~T3, T5, U4 | FIXTURE | `tests/integration/training-lifecycle.test.ts`, `learning-truth` |
| 실패·취소·불명·로드 실패 | A-09~11 일부 | T4, T6~T19, U5~U9 | FIXTURE | 위와 같음 |
| 대역 응답과 계약 일치 | 검증 기반 | 7건 | 계약 스키마 | `tests/integration/fixture-contract.test.ts` |

FIXTURE 사례가 전부 통과해도 A-07~A-12는 통과가 아니다. 해당 기준은 LIVE 증거가 필요하다.

## 3. A 통합 뒤 수동·추가 확인

자동 사례로 판정하지 않는 항목이다. 대상 커밋에서 실제 브라우저로 확인해 스크린샷 경로를 남긴다.

- 소개→선택→교실→상담이 끊기지 않는지 (A-13).
- 1280×800과 390×844에서 글자·컨트롤·대화 패널 겹침이 없는지.
- 사각형·이모지 임시 자산이 최종 화면에 남아 있지 않은지 (PRODUCT_SPEC §5).
- 배경 그림 속 기본 캐릭터 위에 사용자 캐릭터가 겹쳐 보이지 않는지, 사진이 기본 캐릭터로 대체되지 않는지 (`docs/design/ART_DIRECTION.md`).
- 실제 창 전환. headless C6은 `blur` 합성 이벤트라서 실제 OS 포커스 이동을 입증하지 않는다.
- 한글 입력 상태의 WASD. IME 조합 중 keyCode가 229가 되어 이동이 안 될 수 있는데 Playwright로 재현할 수 없다.
- 실제 터치 기기의 방향패드.

## 4. 담당자 요청

통합 전에 맞춰야 자동 사례를 실행할 수 있다. 이름이 달라도 되지만 그 경우 F에게 실제 이름을 알려 준다.

| ID | 담당 | 요청 |
| --- | --- | --- |
| H-1 | B | `NEXT_PUBLIC_AA_TEST_MODE`가 `"1"`일 때만 `window.__AA_TEST__.classroom`을 노출. `ready()`, `snapshot()`, `teleport(x, y)`, `remount()`. 기본 빌드에는 포함하지 않는다. (A가 webServer 설정 완료, `3da15f3`) |
| H-2 | B | 해결. 훅 형태는 요청과 같다. `teacher`는 선생님 충돌 상자의 좌상단이고, `teleport`는 벽·가구 안 좌표를 가장 가까운 빈 칸으로 옮긴다. |
| H-3 | B | 해결. `dpad-right`, 상호작용 키는 E·Enter·Space. |
| H-4 | D | 대화창은 A의 smoke와 같은 역할 이름 `dialog "선생님 상담"`, `닫기` 버튼을 유지. testid: `teacher-input`, `price-panel`, `training-start`, `run-status`. |
| H-5 | C | 해결. `avatar-preview`는 항상 렌더되므로 `data-selection`으로 판정한다. testid: `model-option-<id>`, `agent-name`, `avatar-mode-drawing`, `avatar-mode-photo`, `avatar-pen-color`(색 입력), `avatar-draw-canvas`, `avatar-photo-input`, `avatar-preview`, `avatar-error`, `onboarding-confirm`. |
| H-6 | D | 해결. 학습 자리에서 패널을 열면 진행 중 run을 자동 표시하고, 끝난 run은 `내 학습 기록`에서 연다. |
| H-7 | E | 해결. `tests/support/bindings.product.ts`에 연결했다. |
| H-8 | D | 해결. `askTeacherWith`와 실제 `useConsultStore`를 함께 연결했다. |
| H-9 | A | 해결. `tsconfig`의 `**/*.ts`가 `tests/**`를 포함한다. |
| H-10 | A | 해결. A가 시스템 라이브러리를 설치했고 F worktree에서 우회 없이 e2e 통과를 확인했다. |

## 5. LIVE 필요 항목 (현재 미실행)

키·계정·승인이 필요하며 코드 문제와 별개다. 환경에 공급자 키가 없음을 2026-11-09에 확인했다.

| 기준 | 필요 조건 |
| --- | --- |
| A-05 카탈로그 응답·모델 식별 | Hugging Face 등 실제 응답. 공개 읽기는 키 없이 가능할 수 있으므로 E 결과로 확인 |
| A-07 선생님 실제 응답 | LLM 공급자 키 |
| A-08 가격 근거 | 공급자 가격 출처와 조회 시각 |
| A-09~10 실제 학습 | 사용자가 승인한 모델·자료·공급자·지역·비용 한도. F는 승인 없이 유료 작업을 실행하지 않는다 |
| A-11 결과 로드 | 실제 학습 결과물 |
| A-12 향상 주장 | 분리된 평가 자료. 주장하지 않으면 해당 없음 |

## 6. 제품에 연결하는 방법

1. `tests/support/bindings.product.ts`에서 실제 서비스를 연결한다. 비어 있는 동안 해당 스위트는 skipped로 나오며 통과가 아니다.
2. `tests/e2e/support/app.ts`의 경로, 키, testid를 맞춘다.
3. 대상 커밋에서 `npm run verify`와 `AA_QA_E2E=1 npm run test:e2e`를 실행한다. `AA_QA_E2E`가 없으면 F의 브라우저 스펙은 skipped다.
4. 결과를 `docs/handoffs/F.md`에 대상 SHA와 함께 기록한다.

실행 전에 `rm -rf .next-e2e .data/e2e`를 한다. 낡은 캐시에서는 페이지가 계속 다시 로드되어 `waitClassroomReady`가 시간 초과된다(ENV-3).

대상 커밋별 결과는 `docs/qa/RESULTS-<커밋>.md`에 있다. 최신은 `RESULTS-9ffa6f4.md`다.

## 7. 계약 초안 대조 결과

코드를 바꾸지 않아도 되는 차이는 `tests/support/bindings.product.ts`에서 흡수한다. 아래는 담당자가 알아야 하는 항목이다.

| ID | 담당 | 내용 |
| --- | --- | --- |
| O-1 | E | A가 규칙을 고정했다(`3da15f3`). 조회 실패는 `status`를 유지하고 `pollError`만 설정한다. `status_unknown`은 생성 결과가 불명일 때만 쓰며 관측된 상태를 대체하지 않는다. T10, T19로 판정한다. |
| O-2 | E | `PriceQuote.unitPrice`는 `nonnegative`라서 조회 실패를 0으로 돌려도 스키마를 통과한다. P1이 이를 막는다. |
| O-3 | D | 가격 실패는 오류 봉투와 `freshness: fetch_failed` 견적의 두 형태로 올 수 있다. U1, U2가 둘 다 본다. |
| O-4 | D, E | `LlmChatRequest`에 학생 모델 필드가 없어 프롬프트 문자열로만 전달된다. M1은 프롬프트에 modelId가 들어갔는지로 판정한다. |
| O-5 | D | 해결. M4는 실제 `useConsultStore`로 연결했고 늦은 답변이 새 대화에 들어오지 않는지 판정한다. |
| O-7 | A | `appStore.loadAgent`에 시간 제한이 없다. 요청이 멈추면 `/create`가 `에이전트를 불러오는 중입니다.`에 머문다. 1회 관찰했고 재현되지 않았다. |
| O-6 | A, D | "모델 변경 시 이전 결과 미호환"(M8)은 계약에 첨부 개념이 없어 연결하지 못했다. M8은 미실행이다. |
| O-8 | E, A | `TrainingRun.runtimeReady`는 생성 시 `false`로 쓰인 뒤 바뀌지 않는다. 로드 결과는 `RuntimeStatus`에만 기록된다. 바인딩은 `RuntimeStatus.state === "loaded"`로 읽는다. run의 필드만 보는 소비자는 항상 거짓을 보게 된다. |
