# Agent Academy — 제품 기준서

버전 0.2 · 2026-11-09 · 사용자 원안과 최신 개발 착수 지시 기준

이 문서는 **무엇을 만들고, 무엇을 사실로 말할 수 있는지** 정한다. 제작 방법과 A~F 분업은 [BUILD_PLAN.md](BUILD_PLAN.md)에 둔다. 사용자의 최신 직접 지시가 문서보다 우선한다.

## 1. 제품 정의

사용자가 고른 오픈모델을 자기 캐릭터와 연결하고, 작은 게임 세계의 학교에서 선생님과 상담하여 실제 GPU로 교육한 뒤 자신에게 맞는 에이전트로 키운다.

사용자에게 중요한 것은 ‘내가 고르고, 외형을 만들고, 원하는 능력을 가르친 내 에이전트’라는 경험이다. 개인화된 에이전트의 효용과 소유감이 매력이 된다는 것은 창업자의 가설이며, 시장 검증 결과로 주장하지 않는다.

학교는 제품의 상호작용 구조다. 실제 모델 선택·상담·학습 작업이 게임의 행동과 연결되어야 한다. 화면 연출만으로 실제 교육이 실행됐다고 표현하지 않는다.

## 2. 확정된 원안

기존 제작 문서의 R-001~R-020 식별자를 유지한다. 아래는 사용자 요구이지 구현 완료 목록이 아니다.

| ID | 요구 | 제작 시 지켜야 할 범위 |
| --- | --- | --- |
| R-001 | 나만의 에이전트 학교 | 사용자가 선택한 오픈모델을 원하는 방향으로 교육한다. |
| R-002 | 실제 GPU 학습 | 실제 파라미터를 학습한다. 프롬프트·기억 저장으로 대체하지 않는다. |
| R-003 | 소개와 입장 | 소개/헤더에서 제품을 이해하고 실행 화면으로 들어간다. |
| R-004 | 폭넓은 모델 탐색 | 다양한 출시 모델을 찾아 선택하는 방향. 모든 모델 즉시 학습 지원을 뜻하지 않는다. |
| R-005 | 모델 공급처 연결 | Hugging Face, NVIDIA 계열, Qwen, Kimi 등이 언급됐다. 정확한 모델 ID·버전은 연결 시 검증한다. |
| R-006 | 모델 능력 비교 | 벤치마크를 선택과 조언에 활용한다. 출처 없는 능력치를 만들지 않는다. |
| R-007 | 모델과 캐릭터 연결 | 선택한 모델이 사용자의 에이전트/캐릭터와 연결된다. |
| R-008 | 사용자 외형 제작 | 직접 그리기와 사진 입력을 제공한다. 입력한 외형이 실제 플레이에 반영된다. |
| R-009 | 돌아다니는 작은 세계 | 최초 공간은 아래 R-018에 맞춘다. |
| R-010 | 학교·복도·여러 교실 구상 | 장기 구상으로 보존하되 첫 공간 구현에서 제외한다. |
| R-011 | 선생님 상담 | 선생님이 어떤 수업을 원하는지 묻고, 사용자는 상황을 자연어로 설명한다. |
| R-012 | 현재 모델을 아는 조언 | 선택 모델과 목적을 고려해 설명하고, 근거가 있을 때 대안 모델·교육 방향을 제안한다. |
| R-013 | 게임 안의 클라우드 학습 | Nebius 또는 다른 네오클라우드에 연결해 실제 학습 요청과 상태 확인을 제품 안에서 수행한다. |
| R-014 | 가격 확인 | 실행 시점에 확인 가능한 GPU/학습 가격을 보여주고 조회 시점과 단위를 보존한다. |
| R-015 | 제품 안의 모델 획득 | 선택 모델의 다운로드/원격 준비를 제품 내부에서 연결한다. 실제 저장 위치를 명확히 한다. |
| R-016 | 따뜻한 게임 미술 | 동물의 숲의 따뜻한 분위기·질감·완성도를 지향한다. 자체 캐릭터와 공간을 제작한다. |
| R-017 | 실제로 쓰는 에이전트 | 자기 생활·작업에 맞는 비서처럼 쓰는 장기 목적. 첫 업무와 외부 도구는 미정이다. |
| R-018 | 교실 한 개 | 첫 플레이 공간은 교실 하나다. |
| R-019 | 직접 이동 | 사용자가 캐릭터를 직접 움직인다. 페이지 스크롤이나 카메라 이동만으로 충족되지 않는다. |
| R-020 | 제작 기준과 근거 관리 | 요구·추정·검증 상태를 구분한다. 데모 기획은 뒤로 둔다. |

## 2A. Redesign requirements

USER_CONFIRMED on 2026-11-09  These supersede earlier provisional choices of a 2D classroom or of keeping the renderer  R-018 single classroom and all earlier product behavior remain in force

| ID | Requirement | Scope |
| --- | --- | --- |
| R-021 | Genuine 3D first-person classroom | Perspective camera at eye level with real scene geometry  A flat image, panorama, CSS perspective or scaled sprite scene does not qualify |
| R-022 | First-person control | WASD and mouse look with explicit pointer capture, Escape to release, collision with solid furniture, stable speed across frame rates, touch move and look on touch devices |
| R-023 | Teacher and learning station in the room | Proximity and targeting checks open the teacher dialog  A learning station is reachable in the same classroom |
| R-024 | Dialog and input safety | A dialog releases pointer capture and stops movement  Typing never moves the camera  Closing never silently recaptures  Held input clears on blur, visibility change and pointer cancel |
| R-025 | Immersive landing | Full-viewport entrance with real accessible wordmark, navigation, headline and CTA, restrained motion, reduced-motion support and a composed narrow layout |
| R-026 | Interactive model showroom | Model families on physical display plinths with browse, search, detail and select  Uses real catalog identifiers and separates family from exact model and revision  Never limited to the concept's three models  No invented scores, prices or support claims  A usable DOM catalog alternative exists |
| R-027 | User appearance preserved | Drawing and photo stay in the profile and character preview  Any mapping onto a 3D object is explicit  No default mascot replaces the user and no automatic 3D reconstruction is claimed |
| R-028 | English product copy | All product UI copy is English with no sentence-ending periods |
| R-029 | One visual world | Landing, model selection, character creation, classroom and dialogs read as one world as defined in docs/design/ART_DIRECTION.md |
| R-030 | Adjustable graphics quality | Quality settings for weaker devices  Frame-rate figures are reported only when measured |

Acceptance additions, judged separately from functional correctness

| ID | Requirement | Evidence |
| --- | --- | --- |
| A-15 | R-021 to R-024 | Browser test of movement, look, collision, capture, release and input clearing on the exact final commit |
| A-16 | R-025, R-026 | Browser evidence at desktop and narrow width with real catalog identifiers and the DOM alternative |
| A-17 | R-029 | Screenshot comparison against the three references with remaining gaps listed  Pixel-identical reproduction is not a goal or a claim |
| A-18 | R-030 | Measured performance with browser, device, viewport and quality settings recorded |

## 3. 최초 제작 경험

소개 → 모델 탐색·선택 → 캐릭터 이름과 외형 제작 → 교실 입장 → 직접 이동 → 선생님 상담 → 학습 준비·가격 확인 → 실제 학습 상태 → 결과 사용 준비.

이 흐름은 연결할 제작 순서다. 현재 모든 단계의 연동이 확인됐다는 뜻이 아니다. 공급자 연결 전에는 해당 단계에 연결 필요 상태와 이유를 보여준다.

### 교실

- 교실 한 개에 선생님, 책상, 학습에 접근하는 자리를 배치한다. 배치는 제작자가 결정할 수 있다.
- 사용자가 자기 캐릭터를 이동하고 선생님에게 접근해 대화를 연다. 다시 닫으면 이동을 재개한다.
- 이동은 실제 월드 좌표 변화로 구현한다. 벽·책상 등의 충돌, 입력 해제, 창 전환, 대화 입력 중 이동 억제를 처리한다.
- ‘스크롤바?’는 사용자가 화면 조작부를 가리킨 잠정 표현이다. 방향키/WASD와 화면 방향패드·가상 조이스틱을 초기 제작안으로 사용할 수 있지만 사용자 확정 UI로 기록하지 않는다.
- 학교 외부·복도·추가 교실을 만들면서 첫 교실의 완성도를 희생하지 않는다.

### 모델과 외형

- 카탈로그를 넓게 탐색하는 것과 실제 지원 가능한 모델을 구분한다. 제한된 학습 지원을 전체 모델 지원으로 표현하지 않는다.
- 모델 ID, 공급처, revision/버전, 라이선스 참조, 작업별 지원 상태를 보존한다. revision을 얻지 못했다면 미확인으로 둔다.
- 그림/사진 원본과 게임 렌더링 자산을 구분한다. 사용자가 넣은 그림·사진이 식별 가능하게 반영되어야 한다.
- 첫 구현에서 사진을 2D 외형으로 사용하는 것은 제작 선택이 될 수 있다. 자동 3D 변환·다방향 애니메이션 생성을 제공한다고 약속하지 않는다.
- 모델 교체 시 이전 모델의 학습 결과가 새 모델에 자동 호환된다고 가정하지 않는다.

### 선생님과 수업

- 현재 선택한 모델과 사용자의 자유 서술을 문맥에 넣는다. 선생님을 구동하는 모델과 사용자가 선택한 학생 모델을 혼동하지 않는다.
- 필요한 교육 목적과 자료를 파악한다. 근거 없는 ‘이 모델이 더 좋다’는 결론을 만들지 않는다.
- 비교할 벤치마크가 없거나 조건이 다르면 비교 한계를 설명한다. 선생님의 추천만으로 사용자의 모델을 자동 교체하지 않는다.
- GPU 학습에는 준비된 데이터가 필요하다. 사용자의 한 문장 목적 설명이 그 자체로 학습 데이터가 완성됐다는 뜻은 아니다.
- 특정 업종·첫 수업을 기본 제품 정체성으로 고정하지 않는다.

## 4. 사실을 보여주는 방법

| 구분 | 의미 |
| --- | --- |
| USER_CONFIRMED | 사용자가 직접 요구하거나 결정 |
| DESIGN_DRAFT | 제작을 위한 잠정 선택. A가 근거와 영향을 기록하고 진행 가능 |
| ASSISTANT_PROPOSED | 아직 채택되지 않은 제품 확장 제안 |
| DOC_REVIEWED | 공식 문서에서 지원·동작 설명을 확인 |
| RUNTIME_VERIFIED | 특정 환경·계정·조건에서 실제 실행으로 확인 |
| UNKNOWN / DEFERRED | 미확인 / 이후 범위 |

다음 구분은 데이터와 화면 모두에 적용한다.

| 항목 | 구분해야 하는 상태·근거 |
| --- | --- |
| 모델 | 목록에 존재 / 접근 가능 / 파일 준비 가능 / 추론 가능 / 학습 가능 / 현재 계정 실행 확인 |
| 점수 | 과제·평가셋·조건·원문·확인일. 미측정은 `null`, 0점과 다름 |
| 가격 | 공급자·지역·통화·과금 단위·단가·조회 시각·제외 비용. 단가와 총비용 추정 및 실청구는 다름 |
| 실시간 여부 | 현재 조회 / 캐시와 조회 시각 / 문서에 공개된 가격 / 조회 실패 |
| 교육 | 자료 저장 / 학습 요청 / 대기 / 실행 / 실패 / 취소 요청 / 취소 확인 / 상태 불명 |
| 결과 | 공급자 성공 응답 / 결과물 확인 / 실제 로드·응답 / 성능 평가 |

요청 타임아웃 후 상태를 모르면 기존 요청을 조회해 중복 유료 실행을 방지한다. 취소 버튼을 눌렀다는 이유만으로 취소나 과금 중단을 확정하지 않는다. 학습 완료가 성능 향상을 보장하지 않는다.

## 5. 시각 완성도

따뜻한 색, 부드러운 질감, 친근한 캐릭터, 자연스러운 그림자와 공간 깊이를 지향한다. 화면마다 서로 다른 스타일을 쓰지 않는다. 소개·모델 선택·교실·상담 화면이 하나의 제품처럼 연결되어야 한다.

기본 사각형과 이모지만으로 교실을 완성 처리하지 않는다. 초기 이동 검증용 자산을 썼다면 임시라고 기록하고, 공간·캐릭터·컨트롤의 최종 화면을 브라우저에서 확인한다. 다만 고급 그래픽 수준을 검증 없이 달성했다고 보고하지 않는다.

Superseded by section 2A for the classroom: it is 3D and first person  The specific engine remains an implementation choice recorded in BUILD_PLAN

## 6. 아직 확정하지 않은 확장

자동 교재 생성, 교정 내용의 재학습, 졸업시험/성적표, 결과물 내보내기 상품, 수업 공유·랭킹·마켓·NFT·멀티플레이, 특정 첫 고객군/첫 과목, 구독 가격, 심사위원 개인 취향에 맞춘 기능은 사용자 채택 사실로 취급하지 않는다.

학습 결과물의 저장·식별과 실제 로드 확인은 기술적으로 필요하다. 이를 별도 공유·판매·내보내기 제품 기능의 채택으로 확대하지 않는다. 성능 향상을 주장할 때 비교 검증은 필요하지만, 졸업식 게임 기능을 반드시 만들라는 뜻도 아니다.

## 7. 첫 개발 결과의 수용 기준

각 항목을 독립 판정한다. 미실행을 통과로 표시하지 않는다.

| 검증 ID | 요구 | 통과 근거 |
| --- | --- | --- |
| A-01~03 | R-018, R-019 | 교실 하나가 실행되고 사용자 입력으로 좌표가 변함. 충돌·키 해제·포커스·창 전환 확인 |
| A-04 | R-007, R-008 | 그림과 사진을 각각 입력해 같은 에이전트에 연결하고 플레이 외형 반영 확인 |
| A-05 | R-004, R-005, R-015 | 실제 카탈로그 응답과 모델 식별 근거. 준비/다운로드 경로는 별도 실행 증거 |
| A-06 | R-006, R-012 | 표시 점수의 출처·조건이 있고 추천이 그 근거 범위를 넘지 않음 |
| A-07 | R-011, R-012 | 실제 선생님 응답이 현재 모델과 사용자 목적을 참조. 고정 안내만으로 통과 불가 |
| A-08 | R-013, R-014 | 가격 근거·조회 시각·단위·지원 조건 확인. 조회 실패가 무료로 표시되지 않음 |
| A-09~10 | R-002, R-013 | 실제 파라미터 학습과 결과물의 연결. 실패·취소·불명 상태를 실제 응답에 맞게 처리 |
| A-11 | R-017 | 학습 결과를 로드해 실제 응답 확인. 특정 업무 에이전트 완료는 그 업무도 별도 검증 |
| A-12 | R-002 | 향상을 주장하는 경우 학습과 분리된 평가 자료, 전후 조건·출력·결과 존재 |
| A-13 | R-003, R-016 | 소개→선택→교실→상담이 끊기지 않고 최종 시각 화면 확인 |
| A-14 | R-020 | 계획·코드 작성·실행 확인·미연결 기록이 실제 상태와 일치 |

## 8. 근거와 현재 상태

2026-11-09에 확인한 원격 `main`의 시작 커밋은 `9e6ae6fdba1616f31a169bea43a704dabd1aae35`이며 파일은 README.md 하나였다. 이는 확인 시점의 원격 상태다. 사용자의 기존 Codespaces 내부·미커밋 파일·설치 상태는 확인하지 못했다. A는 현지 상태를 먼저 확인한다.

이 문서 업로드는 앱 구현·모델 연결·GPU 학습 실행을 의미하지 않는다. 초기 상태는 ‘제작 기준 정리 완료, 앱 실행 미검증’이다. 이후 A가 BUILD_PLAN의 진행 기록에 실제 변경을 남긴다.

사용자 근거: 제품 root 설명, ‘데모는 후에’, ‘교실도 한 개만’, ‘직접 유저가 움직이게’, ‘A를 헤드로 수합·총괄’, ‘파일이나 명령어는 직접 전달하니 중요문서만’이라는 이번 대화의 직접 지시.

외부 기술 정보는 구현 직전 공식 문서와 실제 응답으로 재검증한다. 특히 모델 지원·가격·API·학습 결과를 문서만으로 실행 확인 처리하지 않는다.
