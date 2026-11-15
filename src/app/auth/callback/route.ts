import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseServer } from "@/lib/supabase/server";
import { ANON_COOKIE, claimAnonDesigns } from "@/lib/usage";

// Magic-link / OAuth return. Moves any anonymous drafts to the new account.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";
  if (code) {
    const sb = await supabaseServer();
    const { data } = await sb.auth.exchangeCodeForSession(code);
    if (data.user) {
      const anon = (await cookies()).get(ANON_COOKIE)?.value;
      await claimAnonDesigns(data.user.id, anon);
    }
  }
  return NextResponse.redirect(new URL(next.startsWith("/") ? next : "/", url.origin));
}
