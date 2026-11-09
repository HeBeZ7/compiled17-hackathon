import { z } from "zod";
import { IsoTimestamp, TrainingSpec } from "@/shared/contracts";

/**
 * Written to the browser before a create call leaves, so a reload or timeout
 * reuses the same requestKey instead of risking a second paid run.
 */
export const PendingRequest = z.object({
  requestKey: z.uuid(),
  spec: TrainingSpec,
  quoteId: z.string().nullable(),
  savedAt: IsoTimestamp,
});
export type PendingRequest = z.infer<typeof PendingRequest>;

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function storageKey(agentId: string): string {
  return `aa.learning.pending.${agentId}`;
}

/** false means it could not be stored, and the caller must not submit. */
export function savePendingRequest(pending: PendingRequest): boolean {
  const store = storage();
  if (!store) return false;
  try {
    store.setItem(storageKey(pending.spec.agentId), JSON.stringify(pending));
    return true;
  } catch {
    return false;
  }
}

export function loadPendingRequest(agentId: string): PendingRequest | null {
  try {
    const raw = storage()?.getItem(storageKey(agentId));
    if (!raw) return null;
    const parsed = PendingRequest.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function clearPendingRequest(agentId: string): void {
  try {
    storage()?.removeItem(storageKey(agentId));
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}
