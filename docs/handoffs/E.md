# E 인계 — 외부 서비스 연동

- 담당 요구: R-002, R-004~R-006, R-013~R-015, R-017
- 브랜치: `aa/e-services`, 기반 `7a81abd`, 기능 커밋 `5692d4d`
- 변경 경로: `src/server/{catalog,pricing,training,artifacts,inference,llm}/**`, `docs/integrations/**`
- 근거와 공식 URL: [nebius.md](../integrations/nebius.md), [huggingface.md](../integrations/huggingface.md)

## 수행한 검증

| 검증 | 결과 |
| --- | --- |
| `npm run verify` (타입, lint, 단위 64건) | 통과. 공급자는 테스트 대역(주입 fake, fetch stub) |
| `npm run build` | 통과 |
| `PORT=3004 npm run dev` 후 라우트 실제 호출 | 아래 표 |

e2e는 실행하지 않았다.

## 실제 연동 / 대역 / 미연결

| 항목 | 상태 | 근거 |
| --- | --- | --- |
| 카탈로그 검색·상세, 페이지 커서 | **실제 동작** | 라우트 → Hugging Face 실호출 200 |
| 모델 준비(revision 고정, 파일 접근 확인) | **실제 동작**. 공개 모델 `ready`, 접근 제한 모델 `failed` | 라우트 실호출. 가중치 다운로드는 하지 않는다 |
| 학습 자료 저장·형식 검증 | **로컬 실제 동작** | 라우트 실호출 |
| 가격 조회 | **동작하지만 단가 `null`**, `fetch_failed` | 공개 단가 없음. 라우트 실호출 |
| 키 없을 때 학습 차단 | **실제 동작**. 422 `BLOCKED`, 필요한 키 이름 표시 | 라우트 실호출 |
| Nebius 채팅 | 코드 완료, **미연결** | 공식 규격 + 단위 테스트만 |
| Nebius 학습 생성·조회·취소·결과물 확인 | 코드 완료, **미연결** | 공식 규격 + 단위 테스트만 |
| 결과 모델 로드·추론 | 조건부 코드, **미연결** | 공개 배포 API를 찾지 못함 |
| 벤치마크, 다른 카탈로그, 다른 공급자 | **미구현** | |

실제 Nebius 호출로 확인한 것은 키 없는 `GET /v1/models`의 401뿐이다. 유료 작업은 실행하지 않았다.

## 연결에 필요한 것

1. `NEBIUS_API_KEY`: 선생님 채팅과 Nebius 전체.
2. `NEBIUS_TEACHER_MODEL`: 콘솔에서 활성 모델을 골라 지정. 기본값 없음.
3. 유료 학습: `NEBIUS_FINE_TUNING_USD_PER_1M_TOKENS_JSON`, `AA_TRAINING_MAX_USD`, 학습 자료, 사용자가 승인한 모델과 비용 범위.
4. 결과 모델 사용: Nebius 커스텀 가중치 베타 신청, 또는 별도 런타임 구현 결정.

첫 실제 학습에서 확인할 것: 응답의 `suffix` 포함 여부, 목록 `after` 동작, `result_files`의 파일 조회, 체크포인트 이름의 추론 가능 여부.

## A에게 요청

1. `.env.example`에 위 이름과 선택 항목 `HF_TOKEN`을 추가.
2. `tests/e2e/smoke.spec.ts`의 `api reports unwired providers as 503 NOT_CONNECTED`는 카탈로그를 예로 쓴다. 이제 카탈로그는 200이므로 통합 시 이 테스트가 실패한다. 키가 없어 503을 유지하는 예시로 교체가 필요하다(F 소유). 선생님 경로는 D 통합 후 `NOT_CONNECTED`가 될 것이다.
3. 선택: `TrainingRun`에 진행 필드가 없어 공급자 보고 스텝을 `statusReason` 문구로 넣었다. 화면에서 수치로 쓰려면 `trainedSteps`, `totalSteps` 필드 추가가 필요하다.
4. 선택: `completeChat`의 구조화 출력은 추가하지 않았다. Nebius는 `response_format`을 문서화했으나 계약 변경이 필요하다.

## D·F에게

- `getPriceQuote`는 `provider: null`이면 `provider: "nebius"`를 돌려준다.
- 같은 `requestKey`와 같은 spec은 기존 run, 다른 spec은 `CONFLICT`.
- 생성이 공급자에 도달했을 수 있으면 `ok(run)`의 `status: "status_unknown"`으로 돌려준다. 키를 점유한 뒤에는 공급자 전 거부 코드를 반환하지 않는다. D의 `applyCreateResult`는 이 경우 run을 표시하고 폴링한다.
- `TrainingSpec.config`는 `{}`로 충분하다. 허용 키: `batch_size`, `learning_rate`, `n_epochs`, `warmup_ratio`, `weight_decay`, `packing`, `max_grad_norm`, `context_length`, `lora_r`, `lora_alpha`, `lora_dropout`. 범위는 Nebius 스키마와 같고, 다른 키는 차단된다.
- `TrainingSpec.costLimit.currency`는 `USD`여야 한다.
- H-7 주입 지점: `createTrainingService({store, provider, prices, maxApprovedUsd})`, `createPricingService({store, prices})`, `createArtifactService({store, runtime})`. 기존 export 이름과 시그니처는 그대로다.
- O-2: 단가 미확인과 조회 실패는 `unitPrice: null`, `freshness: "fetch_failed"`다.
- Hugging Face 준비 `failed`는 Nebius 학습 불가를 뜻하지 않는다. 학습 가능 여부는 `validateTraining`이 판단한다.

## 남은 장애

- 파인튜닝 단가가 공개되어 있지 않아 키가 있어도 운영자 입력 없이는 학습이 차단된다.
- 공급자 측 예산 상한을 문서에서 찾지 못했다. 서버의 비용 상한은 바이트 기반 추정이며 청구액 보장이 아니다.
- 공개된 추론 경로가 없어 A-11(학습 결과 실제 응답)은 현재 경로로 통과를 약속할 수 없다.
