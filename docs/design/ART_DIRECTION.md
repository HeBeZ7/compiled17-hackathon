# Agent Academy visual direction

## Redesign

Current visual target as of 2026-11-09  It supersedes the 2D layout and engine notes further down in this file  The bright palette and the custom avatar rules below remain in force

| Screen | Reference | Path |
| --- | --- | --- |
| Landing | Immersive classroom entrance with headline left and teacher right | [landing-entrance.png](reference/landing-entrance.png) |
| Model showroom | Family characters on glass-domed plinths with a detail panel | [model-showroom.png](reference/model-showroom.png) |
| First-person classroom | Eye-level view down the rug to the teacher desk | [first-person-classroom.png](reference/first-person-classroom.png) |

Each reference is an offline concept render  Interpret it for real-time rendering and never claim pixel-identical reproduction  Characters in the references are illustrative

Defining qualities

- Convincing depth and eye-level perspective
- Rounded, carefully shaped furniture and characters
- Distinct materials: fabric, ceramic, glass, painted wood and paper
- Neutral daylight, soft contact shadows and controlled highlights
- Bright ivory, mint, sky blue, lavender and coral
- Strong typography, readable controls and deliberate spacing
- Restrained motion that makes the world feel alive

Rules

- Concept images may be references or loading posters and are never playable geometry
- Temporary cubes, flat cutouts and generic primitive characters are blockout assets only
- Furniture has believable thickness, proportions and floor contact
- Product UI copy is English with no sentence-ending periods
- Coral is reserved for main calls to action with bold text of at least 19px
- Display characters are illustrative and users still create their own avatar

Asset inventory lives in [ASSETS.md](ASSETS.md)

---

# Agent Academy — 시각 제작 기준 v0.2

2026-11-09 · 사용자 시각 피드백 반영 · 제품 요구는 [PRODUCT_SPEC.md](../PRODUCT_SPEC.md)가 우선한다.

## 지금 반영할 방향

사용자는 첫 기준 이미지의 노란색·갈색 기운을 지적했고, 더 귀엽고 발랄한 분위기를 원했다. **처음 생성한 누런 목재 교실 이미지는 시각 목표에서 제외한다.** 이 대화의 수정된 밝은 교실 이미지를 사용자가 A/B에게 전달한다. 이미지는 현재 이 저장소에 포함되지 않았다.

이 자료는 진행 중인 앱에 적용할 시각 방향이다. 앱 재작성, 엔진 변경, 개발 중단을 뜻하지 않는다. A가 현지 코드를 확인하고 B/C/D에게 자기 소유 경로 안에서 반영하도록 배정한다.

## 1. 밝고 귀엽고 발랄한 교실

- 깨끗한 낮의 자연광. 흰색은 흰색으로 보여야 한다. 세피아·주황 노을·전면적인 노란 보정을 피한다.
- 밝은 아이보리와 민트·하늘색을 중심으로 분홍·라벤더를 작게 쓴다. 전체가 베이지나 옅은 회색으로 뭉개지지 않게 명도와 채도를 구분한다.
- 둥근 모서리, 부드러운 부피감, 아기자기한 가구, 색감이 있는 책과 작은 식물. 물체의 두께·그림자·바닥 접촉이 자연스러워야 한다.
- 나무는 밝은 자작나무 같은 작은 보조 재질로 사용한다. 진한 갈색 책상·벽이 화면 전체를 지배하지 않게 한다.
- 기본 캐릭터 예시는 큰 머리와 작은 몸, 읽히는 표정, 가벼운 보행·반응으로 귀엽고 생동감 있게 표현한다.
- UI는 흰 카드와 민트/코랄 포인트, 짙은 청록 글자. 두꺼운 고동색 테두리·황동 장식·낡은 종이 효과를 제거한다.

초기 팔레트 제안: 아이보리 #FAFCF7, 민트 #BFE8D4, 하늘색 #BEDFF3, 코랄 #F3A3A6, 라벤더 #D8C9F0, 본문 #234D4A, 주요 버튼 #356D60. 정확한 색 값은 A가 실제 화면의 가독성을 확인하며 조정한다. 연한 장식색을 작은 본문 색으로 쓰지 않는다.

## 2. 캐릭터는 이미지 속 두 종류로 제한하지 않는다

**선생님과 학생의 예시 외형은 시각 참고이며, 고정된 선택 목록이 아니다.** 로봇만 선택하거나 기본 캐릭터만 사용할 수 있게 바꾸지 않는다.

사용자 요구를 유지한다.

1. 사용자가 오픈모델을 선택한다.
2. 이름과 외형을 정한다.
3. 직접 그리거나 사진을 넣는다.
4. 해당 외형이 선택 모델과 같은 에이전트에 연결되어 교실에서 실제로 움직인다.

제공된 사진을 사용자의 선택 없이 엉뚱한 기본 캐릭터로 대체하지 않는다. 첫 구현은 입력한 그림/사진을 2D 표현으로 사용할 수 있다. 자동 3D 변환이나 다방향 애니메이션은 별도 구현과 검증이 있어야 제공한다고 말할 수 있다.

## 3. 좌표 설계도 없이도 고정할 다섯 가지

별도의 정밀 좌표 설계도는 이번 전달물에서 제외한다. B가 실제 구현의 좌표·크기·충돌을 정하고, A/F가 실행 화면으로 확인한다. 이미지와 코드 사이에 해석 차이가 있을 수 있으므로 다음 기준은 반드시 지킨다.

- 첫 공간은 **교실 한 개**다.
- **사용자 캐릭터가 직접 이동**한다. 화면 스크롤이나 카메라 이동만으로 대체하지 않는다.
- 입장 위치에서 선생님과 학습 위치까지 막히지 않은 통로가 있다.
- 선생님에 접근해 상담을 열고, 상담 입력 중에는 이동이 멈춘다.
- 사용자 그림·사진 외형과 현재 선택 모델이 실제 플레이·상담에 반영된다.

가구의 바닥 점유와 실제 충돌, 캐릭터의 앞뒤 가림, 상호작용 거리, 이동 키 해제·창 전환은 B/F가 테스트한다. 시각 이미지 자체가 충돌 위치의 정확한 근거는 아니다.

## 4. 한 장 그림에서 실제 화면으로

기준 이미지는 실행된 제품 화면이나 완성된 자산 묶음이 아니다. 전체 그림을 배경으로 붙인 것만으로 완료 처리하지 않는다.

- 바닥·벽은 정적 배경으로 구성할 수 있다.
- 가구·전경·그림자·이동 캐릭터는 필요한 만큼 분리하고 깊이를 맞춘다.
- 사용자 캐릭터는 실제 좌표가 바뀌는 객체로 만든다.
- 말풍선·상담 입력창·버튼은 실제 텍스트와 상호작용으로 구현한다.
- 그림 속 기본 캐릭터를 배경에 남겨 놓고 사용자 캐릭터를 겹쳐 표시하지 않는다.

2D/2.5D 스타일로 현재 엔진에서 구현 가능하게 자산을 준비한다. 이미지의 화풍을 참고하되, 엔진을 통째로 바꾸거나 복도·추가 공간을 만들지 않는다. 자산 제작·분리·시점 일치 작업은 별도로 필요하다.

## 5. 역할별 반영

- **A:** 공통 색·서체·패널을 현재 구조에 적용하고 B/C/D의 변경 경계를 정한다.
- **B:** 밝은 교실, 귀여운 예시 캐릭터, 자연스러운 이동·그림자·가림을 구현한다.
- **C:** 모델 선택과 직접 그리기/사진 입력 기능을 보존하고 같은 시각 언어를 적용한다.
- **D:** 선생님 상담·학습 화면을 같은 톤으로 맞춘다. 화면이 좁아져도 입력창과 조작부가 겹치지 않게 한다.
- **E:** 데이터·GPU 연동 작업을 계속한다. 시각 이미지의 장식을 실제 수치·상태로 해석하지 않는다.
- **F:** 실제 화면의 색감·가독성·움직임과 기존 수용 기준을 검증한다.

기존 파일 소유권과 worktree를 유지한다. 사용자에게 없는 모델 점수·가격·학습 완료를 장식으로 표시하지 않는다.

## 6. 완료를 판단할 화면

A/B는 실제 실행 화면을 캡처해 수정된 기준 이미지와 비교한다. 누런 색조가 남는지, 캐릭터가 충분히 귀엽고 생동감 있는지, 공간이 읽히는지, 버튼/본문이 읽히는지를 우선 확인한다.

F는 교실 입장→이동→상담, 그림/사진의 실제 반영을 확인하고, 데스크톱과 좁은 화면에서 UI 겹침과 입력 잠금 문제를 확인한다. 이미지만 닮았다는 이유로 기능 검증을 통과시키지 않는다. 실행·브라우저 확인을 못 했다면 그 상태를 그대로 기록한다.

## A에게 전달할 지시

> 앞의 노란 교실 도안은 제외하고, 이번 밝고 귀여운 수정 이미지와 docs/design/ART_DIRECTION.md를 적용해라. 정밀 좌표 설계도는 필요 없으며 기존 구현에 맞춰 배치하라. 교실 한 개·직접 이동·직접 그리기/사진 외형·현재 모델을 아는 상담은 유지해라. 그림 속 캐릭터는 예시이며 선택 가능한 외형을 제한하지 마라. B/C/D의 변경 범위를 나누고 실제 실행 화면을 기준 이미지와 비교해 수정한 뒤 F의 기능 검증을 받아라.
