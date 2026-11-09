# A의 제작 선택 기록

모두 **DESIGN_DRAFT**다. 되돌릴 수 있고 사용자 확정이 아니다. 2026-11-09 작성.

| 영역 | 선택 | 근거 | 영향·되돌리기 |
| --- | --- | --- | --- |
| 생성 방식 | `create-next-app`을 저장소에서 실행하지 않고 설정을 직접 구성 | 16.4.5 생성기가 루트 `AGENTS.md`를 만든다(스크래치 경로에서 확인) | 템플릿의 tsconfig·eslint 구성을 그대로 참고 |
| `agentRules: false` | `next dev`의 AGENTS.md 자동 수정을 끔 | 코딩 에이전트 감지 시 공통 규칙 파일에 블록을 삽입해 모든 worktree가 더럽혀진다 | Next 자체 문서는 `node_modules/next/dist/docs/`에서 직접 읽는다 |
| 버전 | next 16.4.5, react 19.3.0, typescript 5.9, eslint 9, zod 4, phaser 4.2.1, zustand 5, vitest 5, playwright 1.65 | `npm view`와 16.4.5 템플릿의 조합 확인. TS 7·ESLint 10은 템플릿이 아직 쓰지 않아 제외 | 변경은 A가 lockfile로 수행 |
| Cache Components | 템플릿 기본값인 `cacheComponents`, `partialPrefetching`을 끔 | 화면 대부분이 클라이언트, 데이터는 사용자별 동적 조회. 캐시 경계를 B~E가 고려할 이유가 없음 | next.config 한 줄로 활성화 가능 |
| 스타일 | CSS Modules + CSS 변수 | 추가 의존성 없이 feature 내부 스타일 원칙을 지킴 | |
| 디자인 토큰 | `src/shared/ui/tokens.ts`가 정규 소스, 레이아웃에서 CSS 변수로 주입, `phaserColor()`로 게임에 공유 | DOM과 Phaser의 색이 갈라지지 않음 | |
| 팔레트·패널 | ART_DIRECTION v0.2의 초기 제안값을 토큰에 적용. 흰 카드, 민트/코랄 포인트, 짙은 청록 글자, 종이 질감과 갈색 테두리 제거. 주요 글자/배경 쌍은 대비 4.5:1 이상을 계산으로 확인 | 사용자의 시각 피드백(노란색·갈색 제외, 밝고 발랄하게). BUILD_PLAN의 "따뜻한 팔레트"보다 최신 지시가 우선 | 값은 `tokens.ts` 한 곳에서 조정. 수정 기준 이미지와의 비교는 이미지 전달 후 수행 |
| 글꼴 | Jua(제목), Gowun Dodum(본문), `@fontsource` 자체 호스팅 | 둥글고 귀여운 한글 서체. 빌드 시 외부 글꼴 서버 불필요 | 교체는 토큰과 layout에서 |
| 클라이언트 상태 | zustand `src/shared/state/appStore.ts` | 작은 전역 상태. 늦은 응답이 최신 선택을 덮지 않게 epoch 사용 | |
| 저장 | `node:sqlite` 단일 파일, `.data/aa.sqlite` | 추가 네이티브 의존성 없음. 재시작에도 유지되고 유니크 제약으로 idempotency를 원자적으로 처리(BUILD_PLAN "메모리 변수 금지") | 인터페이스 `Store` 뒤에 있어 교체 가능. Node 24의 `node:sqlite` 안정성 단계는 프로덕션 전 재확인 |
| 사용자 경계 | 익명 httpOnly 쿠키 `aa_owner` | E의 사용자별 조회 경계에 필요한 최소 구조. **인증이 아니다** | 실제 계정 도입 시 `resolveOwnerId`만 교체 |
| 입력 검증 | zod 스키마가 곧 계약 타입. 서버는 입력을, 클라이언트는 응답을 파싱 | 계약 드리프트가 `INVALID_RESPONSE`로 드러남 | |
| 에이전트 수 | 브라우저당 1개 (`current`) | 첫 범위에 다수 에이전트 요구 없음 | 저장 키만 변경 |
| 테스트 | vitest(노드), playwright(chromium) | 컴포넌트 동작은 실제 브라우저로 검증. jsdom·RTL은 불필요해 제외 | F가 필요하면 인계 문서로 요청 |
| 포트·격리 | 역할별 포트, `.next`·`.data`·`node_modules`는 worktree마다 별도 | 병렬 실행 충돌 방지. e2e는 `.next-e2e`, `.data/e2e`, 3105 사용 | ASSIGNMENTS 참조 |
| worktree 위치 | `/workspaces/aa-worktrees/` | Codespaces에서 재빌드 후에도 남는 경로이며 저장소 밖이라 추적 파일과 섞이지 않음 | |

## 알려진 사항

- e2e가 전용 빌드 폴더를 쓰면 Next가 tsconfig를 수정하므로 해당 경로를 `tsconfig.json`의 include에 미리 넣어 두었다.
- `npm audit`: moderate 8건, 모두 개발 전용 `eslint-config-next` → `typescript-eslint` 체인. `--force`는 호환을 깨므로 적용하지 않았다.
- `next dev`는 `127.0.0.1`에 바인딩하고, 포트 공개 범위는 변경하지 않는다(Codespaces 기본값 private 유지).
