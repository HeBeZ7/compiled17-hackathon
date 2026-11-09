import { beforeEach, describe, expect, it } from "vitest";
import { bindings } from "../support/load-bindings";
import type { ModelRef, TeacherHarness } from "../support/ports";

// LLM은 테스트 대역이다. 실제 선생님 응답(A-07)의 증거가 아니다.
describe.skipIf(!bindings.teacher)("[대역] 모델 변경과 선생님 상담 문맥", () => {
  let h: TeacherHarness;
  const modelA: ModelRef = { source: "fixture", modelId: "fixture/student-a", revision: "aaa" };
  const modelB: ModelRef = { source: "fixture", modelId: "fixture/student-b", revision: null };

  beforeEach(async () => {
    h = await bindings.teacher!(modelA);
    h.llm.setConnected(true);
    h.llm.replyWith("안내");
  });

  it("M1 모델 변경 후 다음 상담 요청은 새 학생 모델을 문맥에 싣는다", async () => {
    await h.session.send("회의록 정리를 가르치고 싶어요");
    await h.session.selectModel(modelB);
    await h.session.send("이 모델로도 괜찮을까요?");
    expect(h.llm.requests.map((r) => r.studentModelId)).toEqual([modelA.modelId, modelB.modelId]);
  });

  it("M2 사용자의 자유 서술이 상담 요청에 들어간다", async () => {
    await h.session.send("내 일정 비서로 키우고 싶어요");
    expect(h.llm.requests[0].userText).toContain("내 일정 비서로 키우고 싶어요");
  });

  it("M3 선생님 모델과 학생 모델을 따로 기록한다", async () => {
    await h.session.send("질문");
    const req = h.llm.requests[0];
    expect(req.teacherModelId).toBeTruthy();
    expect(req.teacherModelId).not.toBe(req.studentModelId);
    const reply = h.session.state().messages.find((m) => m.role === "teacher")!;
    expect(reply.teacherModelId).toBe(req.teacherModelId);
    expect(reply.studentModelId).toBe(modelA.modelId);
  });

  it("M4 이전 모델 기준 응답이 늦게 도착해도 최신 선택을 덮어쓰지 않는다", async () => {
    const resolve = h.llm.holdNext();
    const pending = h.session.send("모델 A 질문");
    await h.session.selectModel(modelB);
    resolve("늦게 도착한 A 응답");
    await pending;
    const s = h.session.state();
    expect(s.selectedModel.modelId).toBe(modelB.modelId);
    // 모델이 바뀌면 새 상담이다. 이전 모델 답변이 새 대화에 끼어들면 안 된다.
    expect(s.messages.some((m) => m.text.includes("늦게 도착한 A 응답"))).toBe(false);
  });

  it("M5 선생님의 대안 추천은 선택 모델을 자동으로 바꾸지 않는다", async () => {
    h.llm.replyWith("B를 검토해 보세요", { recommend: modelB, evidence: ["fixture-benchmark"] });
    await h.session.send("더 좋은 모델이 있나요?");
    const s = h.session.state();
    expect(s.selectedModel.modelId).toBe(modelA.modelId);
    expect(s.recommendation?.model.modelId).toBe(modelB.modelId);
  });

  it("M6 근거 없는 대안 추천은 추천으로 표시하지 않는다", async () => {
    h.llm.replyWith("B가 더 좋아요", { recommend: modelB, evidence: [] });
    await h.session.send("더 좋은 모델이 있나요?");
    expect(h.session.state().recommendation).toBeNull();
  });

  it("M7 LLM 미연결이면 고정 안내를 맞춤 상담으로 표시하지 않는다", async () => {
    h.llm.setConnected(false);
    await h.session.send("질문");
    const replies = h.session.state().messages.filter((m) => m.role === "teacher");
    expect(replies.every((m) => m.connection === "not_connected")).toBe(true);
    expect(h.llm.requests).toHaveLength(0);
  });

  it.skipIf(bindings.unsupported?.M8)("M8 모델을 바꾸면 이전 모델의 학습 결과를 이어 붙이지 않는다", async () => {
    h.session.attachArtifact("artifact-for-a");
    await h.session.selectModel(modelB);
    expect(h.session.state().attachedArtifactId).toBeNull();
  });
});
