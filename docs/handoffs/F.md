# F 인계 — 검증 준비

대상 독자: A와 B~E 담당자.

## 상태

**검증 준비 단계다. A의 통합 커밋이 없어 기능 검증은 실행하지 않았다.** 아래 통과 결과는 기반 커밋과 테스트 자체에 대한 것이다.

| 항목 | 값 |
| --- | --- |
| 브랜치·worktree | `aa/f-qa`, `/workspaces/aa-worktrees/f-qa` |
| 기능 커밋 | `1f5f0d4` |
| 확인한 기반 커밋 | `7a81abd` (`aa/integration`, B~E 기능 미포함) |
| 통합 커밋 검증 | 미실행. A의 전달 대기 |
| 담당 범위 | PRODUCT_SPEC A-01~A-04, A-06~A-11의 검증 준비, A-13 화면 확인 |

`docs/coordination/ASSIGNMENTS.md`는 확인 시점에 없었다. 이 worktree는 BUILD_PLAN이 정한 이름과 A의 기반 커밋으로 F용이라고 판단했다. 다르면 A가 알려 주면 옮긴다.

## 변경 파일

- `tests/integration/`: 39건. 제품 연결 대기 32건, 대역 응답 계약 검사 7건.
- `tests/e2e/`: 교실 이동 11건, 외형·모델 5건, 가격·학습 표시 9건. Playwright의 두 프로젝트에서 각각 실행된다.
- `tests/support/`, `tests/e2e/support/`: 제품과 맞물리는 지점을 모은 포트와 대역 응답.
- `docs/qa/VERIFICATION_PLAN.md`: 사례 목록, 증거 등급, 담당자 요청, LIVE 필요 항목.

## 수행한 검증

### 기반 커밋 `7a81abd` + 이 브랜치 (실제 실행)

| 명령 | 결과 |
| --- | --- |
| `npm run typecheck` | 통과 |
| `npm run lint` | 통과 |
| `npm run test` | 18건 통과, 32건 skipped(제품 연결 대기). 통과에는 A의 기존 테스트와 F의 계약 검사 7건 포함 |
| `E2E_PORT=3165 npx playwright test` | A의 smoke 8건 통과(데스크톱·390폭 실제 Chromium, 실제 Next 앱). F 스펙 50건 skipped |

smoke는 서비스가 `NOT_CONNECTED`를 돌려주는 기반 상태를 확인한 것이다. 교실 이동·외형·상담 기능의 통과가 아니다.

### 테스트 자체의 탐지력 (제품 증거 아님)

F가 작성한 참조 구현과 결함 주입으로 확인했다. 참조 구현은 제품으로 오인되지 않도록 커밋하지 않았다.

| 항목 | 결과 |
| --- | --- |
| 참조 구현 대상 통합 테스트 | 39건 통과 |
| 참조 구현 대상 Chromium 테스트 | 25건 통과, 2회 반복 50건 통과 |
| 결함 주입 | 62종 전부 해당 테스트가 실패해 탐지 |

- C9가 프레임 타이밍에 따라 결함을 놓치는 것을 발견해 키를 누른 채 유지하도록 고쳤다. 수정 뒤 5회 모두 탐지했다.
- C1, C2, P2는 대응 결함을 주입하지 않은 정상 경로 확인이다.
- 결함 주입은 결함별로 지정한 사례만 실행했다.

## 실제 연동 구분

| 구분 | 내용 |
| --- | --- |
| 실제 공급자 | 호출 없음. 환경에 공급자 키 없음 |
| 테스트 대역 | 통합 테스트의 공급자·가격·LLM, 브라우저 스펙의 `page.route` |
| 실제 브라우저·실제 앱 | 기반 커밋의 smoke만 |
| 미실행 | 통합 커밋 대상 전체, 제품 연결 후 `tests/integration` 32건, F 브라우저 스펙 25건, 수동 확인, LIVE 항목 |

## 결함과 환경 문제

제품 결함: 판정 대상 기능이 아직 없어 보고할 것이 없다.

**ENV-1 — Chromium 시스템 라이브러리 부재 (환경, 심각도 높음)**

- 재현: 이 Codespace에서 `npx playwright test` 실행.
- 예상: 브라우저 실행. 실제: `libatk-1.0.so.0: cannot open shared object file` 등 라이브러리 10개 부재로 전 테스트 실패.
- 조치: Ubuntu 패키지를 세션 임시 폴더에 풀고 `LD_LIBRARY_PATH`로 지정해 실행했다. 시스템은 변경하지 않았다.
- 요청: A가 `npx playwright install-deps chromium` 적용을 결정. 적용 전에는 다른 worktree의 `npm run test:e2e`도 같은 오류가 난다.

**ENV-2 — 1회성 실패 (원인 미확인, 재현 안 됨)**

- 현상: 같은 명령 묶음에서 `npm run verify`가 SIGTERM(143)으로 끊겼고, 이어진 smoke가 8건 모두 실패했다.
- 재확인: 단계를 나눈 재실행에서 typecheck, lint, test, smoke 모두 통과했다.
- 판단: 제품 결함으로 판정하지 않는다. 같은 시각 여러 worktree 작업이 돌고 있었지만 그것이 원인이라는 증거는 없다. 재발하면 원문 로그와 함께 다시 보고한다.

## A에게 필요한 일

`docs/qa/VERIFICATION_PLAN.md` §4의 H-1~H-10과 §7의 O-1~O-6. 우선순위가 높은 것은 다음이다.

- H-1, H-2: 명시적 테스트 모드의 교실 관측 hook. 없으면 이동·외형 사례 16건을 실행할 수 없다.
- H-7, H-8: 학습·가격·선생님 서비스의 공급자 주입 지점. 없으면 통합 테스트 32건을 제품에 연결할 수 없다.
- H-10 / ENV-1: 브라우저 시스템 라이브러리.

## 다음 단계

1. A가 통합 커밋 SHA를 전달한다.
2. F가 그 커밋을 이 worktree에 반영하고 `tests/support/bindings.product.ts`와 `tests/e2e/support/app.ts`를 연결한다.
3. `npm run verify`, `AA_QA_E2E=1 npm run test:e2e`, 수동 확인을 수행하고 결함을 담당자별로 돌려보낸다.
