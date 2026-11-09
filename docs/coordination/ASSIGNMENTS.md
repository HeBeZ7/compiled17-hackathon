# 작업 배정

A 작성 · 2026-11-09. 이 파일은 통합 브랜치에만 있다. 각 작업자는 아래 절대 경로로 읽는다.
`/workspaces/compiled17-hackathon/docs/coordination/ASSIGNMENTS.md`

- **기반 커밋:** `7a81abd6069fecd697c256f15944b5cb28985ba8` (`aa/integration`, B~F 모두 여기서 분기)
- **통합 위치:** `/workspaces/compiled17-hackathon` (`aa/integration`, A 전용). B~F는 이 폴더를 수정하지 않는다.
- **상태:** 브랜치는 로컬에만 있으며 원격에 push하지 않았다.

| 역할 | 작업 경로 | 브랜치 | 개발 포트 | E2E 포트 |
| --- | --- | --- | --- | --- |
| A | `/workspaces/compiled17-hackathon` | `aa/integration` | 3000 | 3100 |
| B 교실 | `/workspaces/aa-worktrees/b-classroom` | `aa/b-classroom` | 3001 | 3101 |
| C 모델·캐릭터 | `/workspaces/aa-worktrees/c-onboarding` | `aa/c-onboarding` | 3002 | 3102 |
| D 선생님·수업 | `/workspaces/aa-worktrees/d-learning` | `aa/d-learning` | 3003 | 3103 |
| E 외부 연동 | `/workspaces/aa-worktrees/e-services` | `aa/e-services` | 3004 | 3104 |
| F 검증 | `/workspaces/aa-worktrees/f-qa` | `aa/f-qa` | 3005 | 3105 |

## 공통 명령

각 worktree에는 `npm ci`가 끝나 있다. `node_modules`, `.next`, `.data/`는 worktree마다 별도다.

```bash
PORT=<개발 포트> npm run dev            # 127.0.0.1 바인딩. 포트 공개 범위는 바꾸지 않는다
npm run verify                          # 타입 검사, lint, 단위 테스트
npm run build
E2E_PORT=<E2E 포트> npm run test:e2e    # 개발 서버와 동시에 실행 가능
```

- 비밀키는 각 worktree의 gitignore된 `.env.local`에만 둔다. 추적 파일에 복사하지 않는다.
- Next 16.4.5 API는 기억 대신 `node_modules/next/dist/docs/`로 확인한다.
- 커밋은 자기 경로만 한다. 공통 변경 요청은 자기 `docs/handoffs/<역할>.md`에 적으면 A가 적용하고 SHA를 전달한다.

## 공통 계약

| 무엇 | 위치 |
| --- | --- |
| 타입·스키마(zod) | `src/shared/contracts/` — `ModelReference`, `AgentProfile`, `AvatarAsset`, `TeacherRequest/Response`, `PriceQuote`, `TrainingSpec`, `TrainingRun`, `ModelArtifact`, `RuntimeStatus`, `ApiError` |
| 화면 props | `src/shared/contracts/ui.ts` — `ClassroomProps`, `OnboardingFlowProps`, `TeacherPanelProps`, `LearningPanelProps` |
| 브라우저 API | `src/shared/api` — `api.*`. 예외를 던지지 않고 `ServiceResult`를 반환한다 |
| 전역 상태 | `src/shared/state/appStore.ts` — 현재 에이전트, overlay, `selectMovementLocked` |
| 공통 UI·토큰 | `src/shared/ui` — `Button`, `Panel`, `StatusBadge`, `ConnectionNotice`, `color`, `phaserColor`, CSS 변수 `--aa-*` |
| 영속 저장 | `src/server/store` — `getStore()`, `COLLECTIONS`, `insertIfAbsent`(idempotency). 사용자 데이터는 `ctx.ownerId`로 분리 |
| HTTP 라우트 | `src/app/api/**` (A 소유). 서비스 함수 이름과 시그니처를 유지하면 라우트 수정이 필요 없다 |

`src/features/**`와 `src/shared/**`에서 `@/server/*`를 import하면 lint 오류다. 서버 호출은 `@/shared/api`로 한다.

## 역할별 범위

소유 경로는 BUILD_PLAN §4 그대로이며 추가·변경이 없다. 시각 기준은 `docs/design/ART_DIRECTION.md` v0.2이고 BUILD_PLAN의 "따뜻한 팔레트" 표현보다 우선한다. 색은 `src/shared/ui/tokens.ts`의 값만 쓰고, 부족하면 A에게 요청한다. 이미지 속 캐릭터는 예시이며 사용자 외형을 제한하지 않는다.

**B** · `src/features/classroom/**`, `public/assets/classroom/**`, `docs/handoffs/B.md`
임시 `Classroom`을 실제 구현으로 교체한다. 밝은 교실 한 개를 바닥·벽 정적 배경과 분리된 가구·전경·그림자로 구성하고, 귀여운 예시 캐릭터, 실제 좌표 이동, 충돌, 앞뒤 가림, 선생님 접근, 키 해제를 구현한다. 입장 위치에서 선생님과 학습 위치까지 막히지 않은 통로를 둔다. 정밀 좌표 설계도는 없으며 좌표는 B가 정한다. 그림 속 캐릭터를 배경에 남기지 않는다. `agent.avatar.renderUrl`을 실제 플레이 캐릭터로 표시한다. 수정 기준 이미지와 실행 화면 캡처를 비교해 인계한다.

**C** · `src/features/onboarding/**`, `src/features/model-picker/**`, `src/features/avatar/**`, `public/assets/avatar/**`, `docs/handoffs/C.md`
임시 `OnboardingFlow`를 교체한다. 모델 선택, 이름, 직접 그리기, 사진 입력을 모두 유지하고 같은 시각 언어를 적용한다. 고정 캐릭터 목록으로 외형을 제한하지 않는다. `api.avatars.upload`와 `api.agents.save`로 저장하고, 현재 빈 카탈로그는 `NOT_CONNECTED`로 표시한다.

**D** · `src/features/teacher/**`, `src/features/learning/**`, `src/server/teacher/**`, `docs/handoffs/D.md`
임시 패널을 실제 상담·학습 흐름으로 교체하고 흰 카드·민트/코랄 톤으로 맞춘다. 좁은 화면에서 입력창과 조작부가 겹치지 않게 한다. `askTeacher`는 E의 `completeChat`을 사용한다. 교사 모델과 학생 모델을 분리한다.

**E** · `src/server/{catalog,pricing,training,artifacts,inference,llm}/**`, `docs/integrations/**`, `docs/handoffs/E.md`
각 `index.ts`의 `NOT_CONNECTED` 뼈대를 실제 어댑터로 교체한다. 시각 이미지의 장식을 수치나 상태로 해석하지 않는다. 필요한 환경 변수 이름은 인계 문서로 요청한다. 유료 GPU 실행은 승인된 모델·자료·공급자·비용 범위가 있을 때만 한다.

**F** · `tests/**`, `docs/qa/**`, `docs/handoffs/F.md`
PRODUCT_SPEC §7과 ART_DIRECTION §6 기준으로 검증을 준비한다. `tests/e2e/smoke.spec.ts`는 A의 기반 확인용이며 F가 이어받는다. 이 테스트가 쓰는 임시 버튼·링크(`선생님에게 말 걸기`, `에이전트 없이 교실 보기`)는 B/C의 구현으로 사라질 수 있으므로 통합 시 실제 조작으로 바꾼다.

## 기반 검증 결과 (`7a81abd`)

RUNTIME_VERIFIED, 이 Codespace 기준.

- `npm run verify`: 통합 위치와 B~F worktree 6곳 모두 통과(단위 테스트 11건)
- `npm run build`: 통합 위치에서 통과
- `npm run test:e2e`: 통합 위치에서 8건 통과(데스크톱, 390px): 소개→생성→교실 이동, canvas 생성, 상담 패널 열고 닫기, 미연결 API의 503 `NOT_CONNECTED`, 에이전트·외형의 실제 저장, 오류 입력 거부
- B·C worktree에서 개발 서버를 3001·3002로 동시에 실행, 각자 별도 `.data/aa.sqlite` 생성 확인
- 미확인: F worktree에서의 e2e. 같은 폴더에서 이미 실행 중이던 다른 서버와 `.next-e2e` 잠금이 겹쳐 시작되지 못했다. 코드 결함이 아니라 동시 실행 충돌이며, 한 worktree에서는 e2e를 한 번에 하나만 실행한다.

아직 없는 것: 실제 캐릭터 이동, 모델 카탈로그, 외형 입력 화면, 선생님 응답, 가격 조회, GPU 학습. 모두 뼈대 또는 임시 화면이다. 수정 기준 이미지와의 비교는 이미지가 전달되지 않아 수행하지 못했다.
