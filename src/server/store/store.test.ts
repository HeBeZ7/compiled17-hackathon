import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RevisionConflictError, createStore, type Store } from "./store";

let dir: string;
let dbPath: string;
let store: Store;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "aa-store-"));
  dbPath = path.join(dir, "aa.sqlite");
  store = createStore(dbPath);
});

afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("store", () => {
  it("keeps data across a restart", () => {
    store.put("runs", "owner-a", "r1", { status: "queued" });
    store.close();
    store = createStore(dbPath);
    expect(store.get("runs", "owner-a", "r1")?.value).toEqual({ status: "queued" });
  });

  it("does not expose one owner's data to another", () => {
    store.put("runs", "owner-a", "r1", { status: "queued" });
    store.putBlob("owner-a", "b1", { mimeType: "image/png", bytes: new Uint8Array([1, 2]) });
    expect(store.get("runs", "owner-b", "r1")).toBeNull();
    expect(store.list("runs", "owner-b")).toEqual([]);
    expect(store.getBlob("owner-b", "b1")).toBeNull();
  });

  it("returns the first doc for a repeated idempotency key", () => {
    const first = store.insertIfAbsent("requests", "owner-a", "key", { runId: "first" });
    const second = store.insertIfAbsent("requests", "owner-a", "key", { runId: "second" });
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.doc.value).toEqual({ runId: "first" });
  });

  it("rejects a write against a stale revision", () => {
    const doc = store.put("agents", "owner-a", "a", { name: "one" });
    store.put("agents", "owner-a", "a", { name: "two" }, { expectedRevision: doc.revision });
    expect(() => store.put("agents", "owner-a", "a", { name: "three" }, { expectedRevision: doc.revision })).toThrow(
      RevisionConflictError,
    );
    expect(store.get("agents", "owner-a", "a")?.value).toEqual({ name: "two" });
  });

  it("rejects creating over an existing doc when null revision is expected", () => {
    store.put("agents", "owner-a", "a", { name: "one" });
    expect(() => store.put("agents", "owner-a", "a", { name: "two" }, { expectedRevision: null })).toThrow(
      RevisionConflictError,
    );
  });

  it("returns blob bytes unchanged", () => {
    const bytes = new Uint8Array([0x89, 0x50, 0, 255]);
    store.putBlob("owner-a", "b1", { mimeType: "image/png", bytes });
    const blob = store.getBlob("owner-a", "b1");
    expect(blob?.mimeType).toBe("image/png");
    expect(Array.from(blob!.bytes)).toEqual(Array.from(bytes));
  });
});
