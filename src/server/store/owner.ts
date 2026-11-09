import "server-only";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";

const OWNER_COOKIE = "aa_owner";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Anonymous per-browser id used to scope stored data. This is a data boundary
 * for the local build, not authentication.
 */
export async function resolveOwnerId(): Promise<string> {
  const jar = await cookies();
  const existing = z.uuid().safeParse(jar.get(OWNER_COOKIE)?.value);
  if (existing.success) return existing.data;

  const ownerId = randomUUID();
  jar.set(OWNER_COOKIE, ownerId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
  });
  return ownerId;
}
