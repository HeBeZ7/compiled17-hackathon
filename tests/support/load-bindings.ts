import type { Bindings } from "./ports";

// AA_QA_BINDINGS는 테스트 자체의 탐지력을 재는 meta 실행에서만 쓴다.
const override = process.env.AA_QA_BINDINGS;
export const bindings: Bindings = override
  ? (await import(/* @vite-ignore */ override)).bindings
  : (await import("./bindings.product")).bindings;
