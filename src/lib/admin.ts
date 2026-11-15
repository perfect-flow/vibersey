import "server-only";
import { timingSafeEqual } from "crypto";
import { env } from "./env";

// Admin routes accept the secret as a Bearer token or a ?secret= query param.
export function isAdmin(req: Request) {
  const given =
    req.headers.get("authorization")?.replace(/^Bearer /, "") ?? new URL(req.url).searchParams.get("secret") ?? "";
  const want = env.adminSecret();
  return given.length === want.length && timingSafeEqual(Buffer.from(given), Buffer.from(want));
}
