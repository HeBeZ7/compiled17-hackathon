# F 인계 — 통합 커밋 검증

대상 독자: A와 B~E 담당자.

## 상태

**통합 커밋 `b6ad9a7`의 자동 검증을 실행했다. 실제 공급자 연동은 검증하지 않았다.** 상세 결과는 [RESULTS-b6ad9a7.md](../qa/RESULTS-b6ad9a7.md)에 있다.

| 항목 | 값 |
| --- | --- |
| 담당 요구 | R-020, 수용 기준 A-01~04, A-13 일부의 BROWSER 검증, A-06~A-11의 FIXTURE 검증 |
| 브랜치·worktree | `aa/f-qa`, `/workspaces/aa-worktrees/f-qa` (E2E 3105) |
| 기능 커밋 | `320e386` |
| 제품 코드 변경 | 없음 |

## 변경 파일

- `tests/support/bindings.product.ts`: 실제 서비스 연결. 공급자·가격·LLM·Hugging Face HTTP만 대역이다.
- `tests/support/ports.ts`: 연결할 수 없는 사례를 이유와 함께 선언하는 `unsupported`.
- `tests/e2e/classroom-surface.spec.ts`: 신규. R1~R4, O1, N1~N4.
- `tests/e2e/avatar-model-link.spec.ts`, `tests/e2e/support/*`: 카탈로그 대역, 2단계 온보딩.
- `tests/integration/*`: P2·M8 skip 조건, T15·M4 변경, 카탈로그 대역 계약 검사.
- `docs/qa/VERIFICATION_PLAN.md`, `docs/qa/RESULTS-b6ad9a7.md`.

## 수행한 검증

```bash
npm run verify
rm -rf .next-e2e .data/e2e
AA_QA_E2E=1 E2E_PORT=3105 npm run test:e2e
```

| 명령 | 결과 |
| --- | --- |
| `npm run verify` | 통과. vitest 209건 통과, 2건 skipped |
| e2e | 76건 통과, 실패 0 |

소프트웨어 WebGL의 headless Chromium에서만 실행했다.

## 실제 연동 구분

| 구분 | 내용 |
| --- | --- |
| 실제 공급자 | 호출 없음. 선생님 LLM·가격·GPU 키 없음 |
| 대역 | 통합 테스트의 공급자·런타임·가격·LLM·Hugging Face HTTP. 브라우저의 카탈로그 검색과 U1~U9 `page.route` |
| 실제 | 제품 서비스, 상담 저장소, SQLite, 교실, 외형 업로드 |
| 미실행 | P2, M8, 실제 창 전환, 한글 IME, 실제 터치, 실제 GPU 렌더링, 기준 이미지 비교, LIVE 전 항목 |

A-05, A-07~A-12는 통과가 아니다.

## A에게 판단 요청

1. **T15:** `verifying_artifact`에서 `trainingCompleted: true`를 맞다고 보고 기대값을 바꿨다. 근거는 계약 주석, 화면 문구, E 단위 테스트다. "결과물 확인 전에는 거짓"이 의도라면 알려 달라. 그 경우 E의 결함이며 기대값을 되돌린다.
2. **O-8:** `TrainingRun.runtimeReady`가 갱신되지 않는다. 필드를 쓰거나 제거할지 정해 달라.
3. **P2:** live 가격 경로가 생기면 `unsupported.P2`를 지운다.

## 결함과 관찰

확정한 제품 결함은 없다. 시각 관찰 O-9, O-10과 환경 문제 ENV-3은 결과 문서에 재현 방법과 함께 있다.

사진 외형의 좌우 잘림은 B가 별도로 수정 중이라 새 결함으로 다루지 않았다. V2·V4의 픽셀 비율은 이를 판정하지 않으므로 수정 뒤 시각 확인이 필요하다.

## 다음 단계

1. B의 사진 수정이 통합되면 V2~V4와 화면 캡처를 다시 본다.
2. 실제 창 전환, 한글 IME, 터치 기기는 사람이 수동으로 확인한다.
3. 키와 승인된 조건이 생기면 LIVE 항목을 실행한다.
