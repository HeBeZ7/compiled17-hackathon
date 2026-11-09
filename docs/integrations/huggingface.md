# Hugging Face Hub 카탈로그 연동

확인일 2026-11-09. 근거: [Hub 엔드포인트](https://huggingface.co/docs/hub/endpoints), [HfApi 문서](https://huggingface.co/docs/huggingface_hub/package_reference/hf_api).

## 연결 상태 (RUNTIME_VERIFIED, 이 Codespace, 인증 없음)

앱 서버의 라우트를 실제로 호출해 확인했다.

| 기능 | 관찰 |
| --- | --- |
| 검색 `GET /api/catalog/models?query=Qwen3-14B&limit=2` | 200. `Qwen/Qwen3-14B`, revision `40c069824f4251a91eefaf281ebe4c544efd3e18`, 라이선스 `apache-2.0` |
| 상세 `GET /api/catalog/model?source=huggingface&modelId=Qwen/Qwen3-0.6B` | 200. revision `c1899de289a04d12100db370d81485cdf75e47ca` |
| 공개 모델 준비 | `ready`, 위치 `remote_hub`, 고정 revision의 `config.json` 접근 확인 |
| 접근 제한 모델 준비 (`meta-llama/Llama-3.1-8B-Instruct`, gated manual) | `failed`, 사유 표시 |

## 동작

- `/api/models`를 `filter=text-generation`, 다운로드 내림차순으로 조회한다. `expand[]`로 목록에서 revision과 접근 제한 정보를 함께 받는다(실제 응답 확인).
- 다음 페이지는 응답 `Link` 헤더의 `cursor`만 꺼내 쓴다. 공식 문서에 `/api/models`의 Link 설명은 찾지 못했고 실제 응답으로 확인했다. 임의 URL을 따라가지 않는다.
- 존재하지 않는 저장소도 인증 없이는 401을 반환했다(실제 응답). 그래서 401·403·404를 모두 `NOT_FOUND`로 묶는다.
- 요청 한도 헤더 관찰값: 300초 창에 500회 (`ratelimit-policy`, 인증 없음).

## 표시 규칙

| 항목 | 기준 |
| --- | --- |
| `listed` | Hub 응답에 존재 |
| `accessible` | `gated: false`이고 비공개가 아닐 때만 `yes`. 접근 제한은 `unknown` |
| `filesPreparable` | 상세 조회에서 공개 모델의 가중치 파일이 보일 때만 `yes`. 목록에서는 `unknown` |
| `training` | Nebius 공식 표 기준(DOC_REVIEWED). 계정 실행 보장이 아니다 |
| `inference`, `accountVerified` | 항상 `unknown` |

## 모델 준비의 의미

준비는 revision 고정과 파일 접근 확인이다. **가중치를 내려받지 않는다.** 관리형 학습은 공급자 쪽 기반 모델을 쓰기 때문이다.

Hugging Face 준비 실패가 Nebius 학습 불가를 뜻하지는 않는다. 예를 들어 `meta-llama/Llama-3.1-8B-Instruct`는 Hub 접근이 제한되어 준비가 실패하지만, Nebius 표에는 학습 지원으로 올라 있다.

## 미연결

- 벤치마크: 출처가 있는 점수를 연결하지 않았다. `benchmarks`는 빈 배열이다.
- NVIDIA·Kimi 등 다른 카탈로그: 미연결. 현재 소스는 `huggingface` 하나다.
