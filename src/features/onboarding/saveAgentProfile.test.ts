import { describe, expect, it, vi, type Mock } from "vitest";
import type { AvatarDraft } from "@/features/avatar";
import { fail, ok, type AgentProfile, type AvatarAsset } from "@/shared/contracts";
import { saveAgentProfile, type ProfileClient } from "./saveAgentProfile";

const ASSET = "6f1e4f1c-4f9b-4c6e-9d3a-0a4d1b7c2e10";
const asset = { assetId: ASSET } as AvatarAsset;
const profile = { version: 2 } as AgentProfile;
const draft: AvatarDraft = {
  inputKind: "photo",
  original: new Blob(["original"], { type: "image/jpeg" }),
  render: new Blob(["render"], { type: "image/png" }),
};
const base = { name: "초코", model: null, expectedVersion: 1, storedUpload: null };

function client(
  overrides: { uploadAvatar?: Mock<ProfileClient["uploadAvatar"]>; saveAgent?: Mock<ProfileClient["saveAgent"]> } = {},
) {
  return {
    uploadAvatar: vi.fn<ProfileClient["uploadAvatar"]>(async () => ok(asset)),
    saveAgent: vi.fn<ProfileClient["saveAgent"]>(async () => ok(profile)),
    ...overrides,
  };
}

describe("saveAgentProfile", () => {
  it("uploads original and render separately, then links the asset to the profile", async () => {
    const api = client();
    const { result } = await saveAgentProfile({ ...base, selection: { status: "draft", draft } }, api);
    expect(result).toEqual(ok(profile));

    const form = api.uploadAvatar.mock.calls[0][0];
    expect(form.get("inputKind")).toBe("photo");
    expect(await (form.get("original") as File).text()).toBe("original");
    expect(await (form.get("render") as File).text()).toBe("render");
    expect(api.saveAgent.mock.calls[0][0]).toEqual({
      name: "초코",
      selectedModel: null,
      avatarAssetId: ASSET,
      expectedVersion: 1,
    });
  });

  it("reuses a saved appearance without uploading it again", async () => {
    const api = client();
    await saveAgentProfile({ ...base, selection: { status: "saved", avatar: asset } }, api);
    expect(api.uploadAvatar).not.toHaveBeenCalled();
    expect(api.saveAgent.mock.calls[0][0].avatarAssetId).toBe(ASSET);
  });

  it("does not store the same draft twice when retrying a failed save", async () => {
    const api = client({ saveAgent: vi.fn<ProfileClient["saveAgent"]>(async () => fail("INTERNAL", "x", { retryable: true })) });
    const first = await saveAgentProfile({ ...base, selection: { status: "draft", draft } }, api);
    expect(first.result.ok).toBe(false);

    await saveAgentProfile({ ...base, storedUpload: first.storedUpload, selection: { status: "draft", draft } }, api);
    expect(api.uploadAvatar).toHaveBeenCalledTimes(1);
    expect(api.saveAgent).toHaveBeenCalledTimes(2);
  });

  it("uploads again once the drawing or photo has changed", async () => {
    const api = client();
    const first = await saveAgentProfile({ ...base, selection: { status: "draft", draft } }, api);
    const changed = { ...draft };
    await saveAgentProfile({ ...base, storedUpload: first.storedUpload, selection: { status: "draft", draft: changed } }, api);
    expect(api.uploadAvatar).toHaveBeenCalledTimes(2);
  });

  it("does not save a profile when the upload fails", async () => {
    const api = client({ uploadAvatar: vi.fn<ProfileClient["uploadAvatar"]>(async () => fail("PAYLOAD_TOO_LARGE", "x")) });
    const { result } = await saveAgentProfile({ ...base, selection: { status: "draft", draft } }, api);
    expect(result.ok).toBe(false);
    expect(api.saveAgent).not.toHaveBeenCalled();
  });

  it("refuses to save without a finished appearance", async () => {
    const api = client();
    for (const selection of [{ status: "none" }, { status: "pending" }] as const) {
      const { result } = await saveAgentProfile({ ...base, selection }, api);
      expect(result.ok).toBe(false);
    }
    expect(api.uploadAvatar).not.toHaveBeenCalled();
    expect(api.saveAgent).not.toHaveBeenCalled();
  });
});
