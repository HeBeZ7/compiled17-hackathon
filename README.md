# Agent Academy

선택한 오픈모델을 내 캐릭터와 연결하고, 교실에서 선생님과 상담해 실제 GPU로 교육하는 제품입니다.

- 제품 기준: [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md)
- 제작·분업: [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md)
- 작업 규칙: [AGENTS.md](AGENTS.md)

## 실행

Node 24 이상이 필요합니다.

```bash
npm ci
PORT=3000 npm run dev   # 127.0.0.1에만 바인딩
```

## 검증

```bash
npm run verify     # 타입 검사, lint, 단위 테스트
npm run build
npm run test:e2e   # 최초 1회 npx playwright install chromium
```
