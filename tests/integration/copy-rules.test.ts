import { describe, expect, it } from "vitest";
import { TRAINING_STATUS_COPY } from "@/features/learning/learningLogic";
import { FREE, copyViolations } from "../e2e/support/copy";

// META: pins the checkers the browser specs rely on, so a green copy check means the rule ran.
describe("copy rule checker", () => {
  it.each(["Your kind of AI", "Unknown · not free", "2.5 USD / gpu_hour", "Qwen2.5-7B-Instruct", "data.jsonl", "fixture-org/Qwen-test-7B", "https://fixture.invalid/prices.", "such as USD", "Saved value (e.g. cached)"])(
    "accepts %s",
    (text) => expect(copyViolations(text)).toEqual([]),
  );

  it.each(["Saved.", "Done. Next step", "교실", "Classroom 교실", "It costs 2.5.", 'Say "hello."'])("flags %s", (text) => {
    expect(copyViolations(text).length).toBeGreaterThan(0);
  });
});

describe("FREE regex", () => {
  it.each(["Free", "free of charge", "It is free", "$0", "$ 0.00", "USD 0", "0 USD", "₩0"])("flags %s", (text) => expect(text).toMatch(FREE));
  it.each(["Unknown · not free", "Price could not be confirmed · this does not mean free", "$0.50", "$10", "2.5 USD", "10 USD", "freedom"])(
    "accepts %s",
    (text) => expect(text).not.toMatch(FREE),
  );
});

describe("training status copy", () => {
  it("has no Hangul or sentence-ending periods in any state, including states a browser spec does not reach", () => {
    const text = Object.values(TRAINING_STATUS_COPY).flatMap((copy) => [copy.label, copy.detail]);
    expect(text.flatMap(copyViolations)).toEqual([]);
  });
});
