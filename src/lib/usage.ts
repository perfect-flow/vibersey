import "server-only";
import { cookies, headers } from "next/headers";
import { randomUUID } from "crypto";
import { supabaseAdmin } from "./supabase/admin";
import { currentUser } from "./supabase/server";
import { env } from "./env";

export const ANON_COOKIE = "vb_anon";

export type Actor =
  | { kind: "user"; userId: string; email: string | null }
  | { kind: "anon"; anonId: string };

// Who is making this request. Anonymous visitors get a long-lived cookie id.
export async function getActor(): Promise<Actor> {
  const user = await currentUser();
  if (user) return { kind: "user", userId: user.id, email: user.email ?? null };
  const store = await cookies();
  let anonId = store.get(ANON_COOKIE)?.value;
  if (!anonId || !/^[0-9a-f-]{36}$/.test(anonId)) {
    anonId = randomUUID();
    store.set(ANON_COOKIE, anonId, { httpOnly: true, sameSite: "lax", secure: true, maxAge: 60 * 60 * 24 * 365, path: "/" });
  }
  return { kind: "anon", anonId };
}

export type UsageResult = { allowed: boolean; used: number; limit: number | null };

// Counts one design/edit generation. Anonymous visitors get a fixed number of
// free generations, then must create a free account.
export async function consumeGeneration(actor: Actor): Promise<UsageResult> {
  const db = supabaseAdmin();
  if (actor.kind === "user") {
    const { data } = await db.from("profiles").select("generation_count").eq("id", actor.userId).single();
    const used = (data?.generation_count ?? 0) + 1;
    await db.from("profiles").update({ generation_count: used }).eq("id", actor.userId);
    return { allowed: true, used, limit: null };
  }
  const limit = env.anonFreeGenerations();
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const { data } = await db.from("anon_sessions").select("generation_count").eq("id", actor.anonId).maybeSingle();
  const used = data?.generation_count ?? 0;
  if (used >= limit) return { allowed: false, used, limit };
  await db.from("anon_sessions").upsert({ id: actor.anonId, ip, generation_count: used + 1, updated_at: new Date().toISOString() });
  return { allowed: true, used: used + 1, limit };
}

export async function usageFor(actor: Actor): Promise<UsageResult> {
  if (actor.kind === "user") return { allowed: true, used: 0, limit: null };
  const { data } = await supabaseAdmin().from("anon_sessions").select("generation_count").eq("id", actor.anonId).maybeSingle();
  const used = data?.generation_count ?? 0;
  const limit = env.anonFreeGenerations();
  return { allowed: used < limit, used, limit };
}

// After signup, move the visitor's anonymous drafts to their account.
export async function claimAnonDesigns(userId: string, anonId: string | undefined) {
  if (!anonId) return;
  const db = supabaseAdmin();
  await db.from("designs").update({ owner_id: userId, anon_id: null }).eq("anon_id", anonId).is("owner_id", null);
  // saved brand boards too (no-op until migration 0003 has run)
  await db.from("brand_boards").update({ owner_id: userId, anon_id: null }).eq("anon_id", anonId).is("owner_id", null);
  await db.from("anon_sessions").update({ claimed_by: userId }).eq("id", anonId);
}
