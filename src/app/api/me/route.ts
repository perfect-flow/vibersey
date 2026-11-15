import { NextResponse } from "next/server";
import { getActor, usageFor } from "@/lib/usage";

export async function GET() {
  const actor = await getActor();
  return NextResponse.json({
    user: actor.kind === "user" ? { id: actor.userId, email: actor.email } : null,
    usage: await usageFor(actor),
  });
}
