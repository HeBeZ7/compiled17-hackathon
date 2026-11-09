# 통합 상태

A 작성 · 2026-11-09 · 브랜치 `aa/integration` · 검증 대상 제품 커밋 `9ffa6f4`

## 실행

```bash
npm ci
PORT=3000 npm run dev    # http://127.0.0.1:3000, Codespaces 포트는 private 유지
npm run verify
npm run build            # e2e와 동시에 실행하지 않는다
rm -rf .next-e2e .data/e2e && AA_QA_E2E=1 E2E_PORT=3100 npm run test:e2e
```

역할별 포트는 [ASSIGNMENTS.md](ASSIGNMENTS.md)를 따른다. `.next-e2e`를 재사용하면 페이지 재로드가 반복되므로 e2e 전에 지운다.

## 품질

| 항목 | 결과 | 근거 |
| --- | --- | --- |
| `npm run verify` | 통과. 단위·통합 209건, 2건 건너뜀(P2, M8) | F, A |
| `npm run build` | 통과 | F |
| 브라우저 e2e | 78건 통과, 0건 실패(39건×데스크톱·390×780) | F, `docs/qa/RESULTS-9ffa6f4.md` |
| 실행 화면 | [evidence/9ffa6f4/](evidence/9ffa6f4/) 10장 | A. 실시간 Hugging Face 목록, 그림·사진 입력 |

환경은 headless Chromium의 소프트웨어 WebGL이다. 실제 GPU 렌더링은 미실행이다.

## 수용 기준

| ID | 상태 | 근거·한계 |
| --- | --- | --- |
| A-01~03 | 로컬 확인 | C1~C11. 창 전환·pointer cancel은 합성 이벤트이며 실제 OS 창 전환·터치 기기·한글 입력기는 미실행 |
| A-04 | 로컬 확인 | V1~V4, V6(대역 카탈로그), A 캡처(실제 카탈로그). 실제 사진 파일과 크롭 조정은 판정하지 않음 |
| A-05 | 공급자 일부 확인 | Hugging Face 목록·상세 실제 응답. 모델 준비는 파일 접근 확인까지이며 가중치 다운로드 미실행 |
| A-06 | 코드·대역 | 실제 벤치마크 데이터 미연결 |
| A-07 | 미실행 | `NEBIUS_API_KEY` 없음. 고정 안내와 `연결 필요`만 확인 |
| A-08 | 미통과 | 조회 실패가 무료로 표시되지 않음은 확인. 공개 단가가 없어 실제 가격 미확인 |
| A-09~10 | 미실행 | Nebius 학습 경로는 코드와 대역 테스트만 |
| A-11 | 미실행 | 파인튜닝 결과를 띄우는 공개 경로를 찾지 못함. 커스텀 가중치는 신청제 베타 |
| A-12 | 미실행 | 학습 결과 없음 |
| A-13 | 일부 확인 | 소개→선택→교실→상담 실행 확인. 수정 기준 이미지 미전달로 이미지 비교 미실행 |
| A-14 | 이 문서 | |

## 실제 연동

| 대상 | 상태 |
| --- | --- |
| Hugging Face 카탈로그 | 실제 호출 확인 |
| SQLite 저장, 외형 업로드 | 실제 동작 |
| 선생님 LLM | 미연결. 키 없음 |
| 가격 | 미확인. `null`, `fetch_failed` 표시 |
| Nebius 학습·결과물 | 코드와 대역만. 유료 실행 없음 |
| 결과 모델 로드·추론 | 미연결 |

## 남은 일

- 필요한 입력: 수정 기준 이미지, `NEBIUS_API_KEY`, `NEBIUS_TEACHER_MODEL`, 파인튜닝 단가, `AA_TRAINING_MAX_USD`, 학습 자료, 승인된 비용 범위
- 결과 모델 사용 경로 결정: Nebius 커스텀 가중치 베타 또는 별도 런타임
- E: `TrainingRun.runtimeReady`가 true로 설정되지 않음(O-8), 학습 자료 조회 API, 모델 준비 중복 처리
- B: 선생님 바로 아래에서 이름표가 얼굴과 겹침(O-9), 390폭에서 방향패드 아래쪽 여백(O-10)
- C: 사진 원본의 EXIF 제거(공유 기능 도입 전), 재진입 시 모델 준비 상태 복원
