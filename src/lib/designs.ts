import "server-only";
import { supabaseAdmin } from "./supabase/admin";
import type { Actor } from "./usage";
import { DesignSpecSchema, type DesignSpec } from "./design-spec";

export type DesignRow = {
  id: string;
  owner_id: string | null;
  anon_id: string | null;
  sport: DesignSpec["sport"];
  title: string;
  spec: DesignSpec;
  preview_url: string | null;
  locked: boolean;
  created_at: string;
  updated_at: string;
};

export function canEdit(d: DesignRow, actor: Actor) {
  return actor.kind === "user" ? d.owner_id === actor.userId : d.anon_id === actor.anonId && !d.owner_id;
}

export async function getDesign(id: string): Promise<DesignRow | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const { data } = await supabaseAdmin().from("designs").select("*").eq("id", id).maybeSingle();
  if (!data) return null;
  const parsed = DesignSpecSchema.safeParse(data.spec);
  return { ...(data as DesignRow), spec: parsed.success ? parsed.data : (data.spec as DesignSpec) };
}

export async function getDesignForActor(id: string, actor: Actor) {
  const d = await getDesign(id);
  return d && canEdit(d, actor) ? d : null;
}

export async function getMessages(designId: string) {
  const { data } = await supabaseAdmin()
    .from("design_messages")
    .select("role, content")
    .eq("design_id", designId)
    .order("id", { ascending: true });
  return (data ?? []) as { role: "user" | "assistant"; content: string }[];
}
