import { beforeEach, describe, expect, it } from "vitest";
import { bindings } from "../support/load-bindings";
import type { TrainingHarness } from "../support/ports";

// 공급자는 전부 테스트 대역이다. 이 스위트의 통과는 A-09~10의 실제 공급자 검증이 아니다.
describe.skipIf(!bindings.training)("[대역] 학습 수명주기 BUILD_PLAN §8", () => {
  let h: TrainingHarness;
  const valid = { requestKey: "11111111-1111-4111-8111-111111111111", spec: "valid" as const };

  beforeEach(async () => {
    h = await bindings.training!();
    h.provider.scriptCreate("accepted");
  });

  const submitRunning = async () => {
    const run = await h.service.submit(valid);
    h.provider.setJob("running");
    return h.service.refresh(run.runId);
  };

  describe("중복 학습 방지", () => {
    it("T1 같은 요청 키를 다시 보내면 공급자 생성은 한 번이고 같은 run을 돌려준다", async () => {
      const a = await h.service.submit(valid);
      const b = await h.service.submit(valid);
      expect(h.provider.counts.create).toBe(1);
      expect(b.runId).toBe(a.runId);
    });

    it("T2 같은 요청 키의 동시 요청도 공급자 생성은 한 번이다", async () => {
      const [a, b, c] = await Promise.all([
        h.service.submit(valid), h.service.submit(valid), h.service.submit(valid),
      ]);
      expect(h.provider.counts.create).toBe(1);
      expect(new Set([a.runId, b.runId, c.runId]).size).toBe(1);
    });

    it("T3 프로세스 재시작 뒤에도 같은 요청 키로 재생성하지 않는다", async () => {
      const a = await h.service.submit(valid);
      const restarted = await h.restart();
      const b = await restarted.submit(valid);
      expect(h.provider.counts.create).toBe(1);
      expect(b.runId).toBe(a.runId);
    });
  });

  describe("상태 불명", () => {
    beforeEach(() => h.provider.scriptCreate("timeout"));

    it("T4 생성 응답 timeout은 status_unknown이고 작업 ID를 만들지 않는다", async () => {
      const run = await h.service.submit(valid);
      expect(run.status).toBe("status_unknown");
      expect(run.providerJobId).toBeNull();
    });

    it("T5 상태 불명 뒤 같은 키 재요청은 공급자 생성을 다시 호출하지 않는다", async () => {
      await h.service.submit(valid);
      await h.service.submit(valid);
      expect(h.provider.counts.create).toBe(1);
    });

    it("T6 기존 요청을 조회해 작업이 확인되면 그 작업으로 수렴한다", async () => {
      const run = await h.service.submit(valid);
      h.provider.revealLostJob();
      h.provider.setJob("running");
      const after = await h.service.refresh(run.runId);
      expect(after.status).toBe("running");
      expect(after.providerJobId).not.toBeNull();
      expect(h.provider.counts.create).toBe(1);
    });
  });

  it("T7 생성 거절은 failed이고 작업 ID와 결과물이 없다", async () => {
    h.provider.scriptCreate("rejected");
    const run = await h.service.submit(valid);
    expect(run.status).toBe("failed");
    expect(run.providerJobId).toBeNull();
    expect(run.artifactId).toBeNull();
  });

  it("T8 자료가 없으면 blocked와 이유를 돌려주고 공급자를 호출하지 않는다", async () => {
    const run = await h.service.submit({ requestKey: "22222222-2222-4222-8222-222222222222", spec: "missing_data" });
    expect(run.status).toBe("blocked");
    expect(run.blockedReasons.length).toBeGreaterThan(0);
    expect(h.provider.counts.create).toBe(0);
  });

  it("T9 학습 미지원 모델은 서버에서 다시 확인해 차단한다", async () => {
    const run = await h.service.submit({ requestKey: "33333333-3333-4333-8333-333333333333", spec: "unsupported_model" });
    expect(run.status).toBe("blocked");
    expect(h.provider.counts.create).toBe(0);
  });

  it("T10 조회 한 번 실패는 학습 실패가 아니며 마지막 관측 상태와 조회 오류를 구분한다", async () => {
    const run = await submitRunning();
    h.provider.failNextPoll();
    const after = await h.service.refresh(run.runId);
    expect(after.status).not.toBe("failed");
    expect(after.status).toBe("running");
    expect(after.pollError).toBeTruthy();
  });

  it("T19 조회 실패가 반복돼도 관측된 상태를 status_unknown으로 대체하지 않는다", async () => {
    const run = await submitRunning();
    for (let i = 0; i < 3; i++) {
      h.provider.failNextPoll();
      const after = await h.service.refresh(run.runId);
      expect(after.status).toBe("running");
      expect(after.pollError).toBeTruthy();
    }
  });

  it("T11 공급자의 실패 응답은 failed이고 trainingCompleted가 아니다", async () => {
    const run = await submitRunning();
    h.provider.setJob("failed");
    const after = await h.service.refresh(run.runId);
    expect(after.status).toBe("failed");
    expect(after.trainingCompleted).toBe(false);
  });

  describe("취소", () => {
    it("T12 취소 요청만으로는 canceled가 아니다", async () => {
      const run = await submitRunning();
      const after = await h.service.cancel(run.runId);
      expect(after.status).toBe("cancel_requested");
      expect(h.provider.counts.cancel).toBe(1);
    });

    it("T13 공급자가 취소를 확인한 뒤에만 canceled가 된다", async () => {
      const run = await submitRunning();
      await h.service.cancel(run.runId);
      h.provider.setJob("canceled");
      expect((await h.service.refresh(run.runId)).status).toBe("canceled");
    });

    it("T14 취소 요청 중 공급자가 성공으로 끝나면 실제 최종 상태를 따른다", async () => {
      const run = await submitRunning();
      await h.service.cancel(run.runId);
      h.provider.setJob("succeeded");
      h.provider.setArtifact("present");
      const after = await h.service.refresh(run.runId);
      expect(after.status).not.toBe("canceled");
      expect(["verifying_artifact", "completed"]).toContain(after.status);
    });
  });

  describe("결과물과 로드", () => {
    it("T15 공급자 성공 응답만으로는 completed가 아니다", async () => {
      const run = await submitRunning();
      h.provider.setJob("succeeded");
      h.provider.setArtifact("missing");
      const after = await h.service.refresh(run.runId);
      expect(after.status).toBe("verifying_artifact");
      expect(after.trainingCompleted).toBe(false);
      expect(after.artifactId).toBeNull();
    });

    const complete = async () => {
      const run = await submitRunning();
      h.provider.setJob("succeeded");
      h.provider.setArtifact("present");
      return h.service.refresh(run.runId);
    };

    it("T16 결과물 확인 뒤 completed가 되지만 runtimeReady는 아직 거짓이다", async () => {
      const after = await complete();
      expect(after.status).toBe("completed");
      expect(after.trainingCompleted).toBe(true);
      expect(after.artifactId).not.toBeNull();
      expect(after.runtimeReady).toBe(false);
    });

    it("T17 결과 로드 실패는 학습 상태와 별도로 보존하고 사용 가능으로 표시하지 않는다", async () => {
      const run = await complete();
      h.provider.setRuntime("load_error");
      const after = await h.service.loadResult(run.runId);
      expect(after.status).toBe("completed");
      expect(after.trainingCompleted).toBe(true);
      expect(after.runtimeReady).toBe(false);
      expect(after.runtimeError).toBeTruthy();
    });

    it("T18 실제 응답을 확인해도 평가 결과를 만들어 내지 않는다", async () => {
      const run = await complete();
      h.provider.setRuntime("responds");
      const after = await h.service.loadResult(run.runId);
      expect(after.runtimeReady).toBe(true);
      expect(after.evaluationResult).toBeNull();
    });
  });
});
