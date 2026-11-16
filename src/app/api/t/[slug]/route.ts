import { NextResponse } from "next/server";
import { getKits, getTeamBySlug } from "@/lib/teams";

// Public info for a team's shareable order link.
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const found = await getTeamBySlug(slug);
  if (!found || !found.team.share_enabled) return NextResponse.json({ error: "This team link isn't active." }, { status: 404 });
  return NextResponse.json({
    team: { name: found.team.name, slug: found.team.share_slug },
    design: { id: found.design.id, sport: found.design.sport, title: found.design.title, spec: found.design.spec },
    kits: (await getKits(found.team)).map((k) => ({ label: k.label, design_id: k.design_id, spec: k.spec })),
  });
}
