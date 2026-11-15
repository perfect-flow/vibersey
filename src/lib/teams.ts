import "server-only";
import { z } from "zod";
import { supabaseAdmin } from "./supabase/admin";
import { getDesign } from "./designs";
import type { Actor } from "./usage";

export const RosterEntryInput = z.object({
  player_name: z.string().max(16).default(""),
  number: z.string().max(3).default(""),
  size: z.string().min(1).max(8),
  quantity: z.coerce.number().int().min(1).max(50).default(1),
  email: z.string().email().nullable().optional(),
});

export function cleanEntry(e: z.infer<typeof RosterEntryInput>) {
  return {
    ...e,
    player_name: e.player_name.trim().toUpperCase(),
    number: e.number.replace(/[^0-9]/g, ""),
    size: e.size.trim().toUpperCase(),
  };
}

export async function getTeamForOwner(id: string, actor: Actor) {
  if (actor.kind !== "user" || !/^[0-9a-f-]{36}$/.test(id)) return null;
  const { data } = await supabaseAdmin().from("teams").select("*").eq("id", id).eq("owner_id", actor.userId).maybeSingle();
  return data;
}

export async function getTeamBySlug(slug: string) {
  const { data: team } = await supabaseAdmin().from("teams").select("*").eq("share_slug", slug).maybeSingle();
  if (!team) return null;
  const design = await getDesign(team.design_id);
  return design ? { team, design } : null;
}
