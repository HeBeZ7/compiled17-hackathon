import { getStore } from "@/server/store";
import { handler } from "../_lib/route";
import { ok } from "@/shared/contracts";

export const GET = handler(async () => {
  // Touches the store so this reports real persistence, not just a running process.
  getStore().list("health", "system", 1);
  return ok({ status: "ok", checkedAt: new Date().toISOString() });
});
