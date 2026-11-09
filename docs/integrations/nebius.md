# Nebius Token Factory 연동

확인일 2026-11-09. 키 이름만 기록하고 값은 기록하지 않는다.
상태 표기: DOC_REVIEWED(공식 문서 확인), RUNTIME_VERIFIED(실제 호출 확인), UNKNOWN(미확인).

## 경로 선택

| 경로 | 무엇 | 판단 |
| --- | --- | --- |
| Token Factory 파인튜닝 API | 공급자가 학습을 실행하는 관리형 작업 | **1차 경로로 구현** |
| AI Cloud GPU VM | GPU 인스턴스 임대. 학습 실행기, 체크포인트 저장, 종료를 직접 만들어야 함 | 채택하지 않음. VM 생성은 학습이 아니다 |

## 연결 상태

| 기능 | 코드 | 실제 Nebius 호출 |
| --- | --- | --- |
| 선생님 채팅 `completeChat` | 구현 | 미실행. `NEBIUS_API_KEY` 없음 |
| 학습 자료 업로드 | 구현 | 미실행 |
| 학습 생성·조회·취소, 불명 상태 대조 | 구현 | 미실행. 유료 실행 조건 없음 |
| 결과물 확인 | 구현 | 미실행 |
| 결과 모델 로드·추론 | 조건부 구현 | 미실행. 아래 "결과 모델 추론" 참조 |
| 파인튜닝 단가 | 운영자 입력값만 사용 | 공개 단가 없음 |

실제 호출로 확인한 것은 키 없는 `GET /v1/models`가 401을 반환한다는 사실뿐이다. 나머지는 모두 문서 기준이며 현재 계정에서 동작한다고 주장하지 않는다.

## 필요한 서버 설정

| 이름 | 용도 | 없을 때 |
| --- | --- | --- |
| `NEBIUS_API_KEY` | 모든 Nebius 호출 | 해당 기능 `NOT_CONNECTED` |
| `NEBIUS_TEACHER_MODEL` | 선생님 모델 ID. 기본값을 두지 않음 | 선생님 `NOT_CONNECTED` |
| `NEBIUS_FINE_TUNING_USD_PER_1M_TOKENS_JSON` | 모델 ID별 학습 단가 JSON. 콘솔에서 운영자가 옮겨 적음 | 단가 `null`, 학습 `BLOCKED` |
| `AA_TRAINING_MAX_USD` | 1회 학습 승인 한도(USD) | 학습 `BLOCKED` |
| `HF_TOKEN` (선택) | 접근 제한 모델의 파일 확인, Hub 요청 한도 | 공개 모델만 준비 가능 |

## 공식 규격 (DOC_REVIEWED)

Base `https://api.tokenfactory.nebius.com/v1`, `Authorization: Bearer`.

| 동작 | 요청 | 근거 |
| --- | --- | --- |
| 채팅 | `POST /chat/completions` | [문서](https://docs.tokenfactory.nebius.com/api-reference/inference/create-chat-completion.md) |
| 모델 목록 | `GET /models` | [문서](https://docs.tokenfactory.nebius.com/api-reference/models/list-models.md) |
| 파일 업로드 | `POST /files`, `purpose=fine-tune` | [가이드](https://docs.tokenfactory.nebius.com/post-training/how-to-fine-tune) |
| 파일 확인 | `GET /files/{id}` | 같은 가이드 |
| 학습 생성 | `POST /fine_tuning/jobs` | [문서](https://docs.tokenfactory.nebius.com/api-reference/fine-tuning/create-a-fine-tuning-job) (OpenAPI `20261105-4c58718c5`) |
| 조회·목록·취소 | `GET /fine_tuning/jobs/{id}`, `GET /fine_tuning/jobs`, `POST /fine_tuning/jobs/{id}/cancel` | API 레퍼런스 |
| 체크포인트 | `GET /fine_tuning/jobs/{id}/checkpoints` | 가이드 |

상태값 `validating_files`, `queued`, `running`, `succeeded`, `failed`, `cancelled`를 내부 `validating`, `queued`, `running`, `verifying_artifact`, `failed`, `canceled`로 변환한다.

학습 지원 모델은 [공식 표](https://docs.tokenfactory.nebius.com/fine-tuning/models)를 `src/server/training/nebiusModels.ts`에 옮겼다. 표에 없는 모델은 `no`가 아니라 `unknown`이다. API 예시의 `meta-llama/Llama-3.1-70B-Instruct`는 표에 없어 포함하지 않았다. 표에 `qlora`는 없어 거부한다.

데이터셋은 [형식 문서](https://docs.tokenfactory.nebius.com/post-training/datasets.md)의 conversational, instruction, text JSONL을 받는다. pretokenized는 받지 않는다. 구버전 문서는 5GB, 신규 문서는 Files API 20GB로 다르지만, 이 앱은 로컬 저장 한도 64MB가 먼저 적용된다.

## 설계상 주의 사항

- **중복 생성 방지.** 문서에 idempotency 키가 없다. 내부 `requestKey`를 먼저 저장하고, `suffix`에 `aa-<requestKey>`를 넣어 보낸다. 생성 결과가 불명이면 `status_unknown`으로 두고 목록에서 같은 suffix를 찾을 뿐 자동으로 다시 만들지 않는다. suffix가 응답에 항상 포함되는지는 문서에 없고, 목록의 `after` 의미도 "cursor"로만 적혀 있어 **실제 응답으로 확인이 필요하다**.
- **취소.** 문서는 "Immediately cancel"이라고만 하며 과금 영향은 적지 않았다. 공급자가 `cancelled`를 보고해야 `canceled`로 바꾼다.
- **비용 상한.** 공급자 측 예산 제한은 문서에서 찾지 못했다. 서버는 `자료 바이트 × epoch × 단가`를 토큰 상한 추정으로 삼아 사용자 한도 및 `AA_TRAINING_MAX_USD`와 비교한다. 청구액 보장이 아니다.
- **계정 조건.** 결제 계정(카드) 필수. [Billing](https://docs.tokenfactory.nebius.com/other-capabilities/billing-new.md). 파인튜닝 최소 잔액과 동시 실행 한도는 문서에 없다.
- **선생님 모델.** 2026-11-09자로 서버리스 모델 11종이 제거되고 자동 재라우팅이 없다. [공지](https://docs.tokenfactory.nebius.com/november-2026-deprecation-notice.md). 그래서 모델 ID를 코드에 고정하지 않는다.

## 가격

- **학습 단가: UNKNOWN.** 공개 문서에서 찾지 못했다. [콘솔 가격 페이지](https://tokenfactory.nebius.com/organization/prices)는 비로그인 조회로 내용이 없었다. 공식 소개는 처리 토큰 기준 과금이라고만 설명한다.
- 기본 응답은 `unitPrice: null`, `freshness: fetch_failed`다. 운영자 입력값이 있으면 `published_doc`으로 표시하며 실시간 조회로 표시하지 않는다.
- [AI Cloud GPU 가격](https://nebius.com/prices)은 VM 요금이므로 학습 견적에 쓰지 않는다.

## 결과 모델 추론

파인튜닝 결과를 서비스로 띄우는 공개 API를 문서에서 찾지 못했다.

- 커스텀 가중치 전용 엔드포인트(`custom_weights_id`)는 "currently in beta and available on request"다. [문서](https://docs.tokenfactory.nebius.com/ai-models-inference/dedicated-endpoints/custom-weights.md). `custom_weights_id`를 얻는 방법은 문서에 없다.
- 서버리스 LoRA 배포는 [모델 문서](https://docs.tokenfactory.nebius.com/fine-tuning/models)에 언급되지만, 연결된 배포 문서는 404이고 색인에도 해당 API 문서가 없다.
- 그래서 코드는 추론 모델명을 추측하지 않는다. 체크포인트의 `fine_tuned_model_checkpoint` 값이 `GET /models` 목록에 실제로 있을 때만 호출하고, 실제 응답을 받아야 `loaded`로 표시한다. 없으면 `not_loaded`와 `NOT_CONNECTED`를 돌려준다.
- 대안은 Nebius 지원에 베타를 신청하거나, 결과 파일을 내려받아 별도 런타임에 올리는 것이다. 둘 다 미구현이다.
