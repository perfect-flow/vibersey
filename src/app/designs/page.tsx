"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { JerseyPreview } from "@/components/JerseyPreview";
import { AuthForm } from "@/components/AuthForm";
import { productByKey } from "@/lib/catalog";
import type { DesignSpec } from "@/lib/design-spec";

type Design = { id: string; title: string; sport: string; spec: DesignSpec; locked: boolean; updated_at: string };
type Team = { id: string; name: string; design_id: string; share_slug: string };

export default function MyDesigns() {
  const [state, setState] = useState<"loading" | "anon" | "ready">("loading");
  const [designs, setDesigns] = useState<Design[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);

  useEffect(() => {
    fetch("/api/designs").then(async (r) => {
      if (r.status === 401) return setState("anon");
      const d = await r.json();
      setDesigns(d.designs);
      setTeams(d.teams);
      setState("ready");
    });
  }, []);

  async function remove(id: string) {
    const r = await fetch(`/api/design/${id}`, { method: "DELETE" });
    if (r.ok) setDesigns((ds) => ds.filter((d) => d.id !== id));
  }

  if (state === "loading") return <div className="p-10 text-center text-muted">Loading…</div>;
  if (state === "anon")
    return (
      <section className="mx-auto max-w-md px-4 py-16">
        <h1 className="font-display text-5xl tracking-wide">Sign in to see your designs</h1>
        <div className="mt-6">
          <AuthForm next="/designs" />
        </div>
      </section>
    );

  const templates = new Map(teams.map((t) => [t.design_id, t]));
  return (
    <section className="mx-auto max-w-6xl space-y-10 px-4 py-10">
      {teams.length > 0 && (
        <div>
          <h2 className="mb-3 font-display text-4xl tracking-wide">Teams</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {teams.map((t) => (
              <Link key={t.id} href={`/teams/${t.id}`} className="card p-4 hover:border-volt">
                <div className="font-semibold">{t.name}</div>
                <div className="text-sm text-muted">Manage roster, share link, order</div>
              </Link>
            ))}
          </div>
        </div>
      )}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-4xl tracking-wide">My designs</h2>
          <Link href="/" className="btn-primary">
            New design
          </Link>
        </div>
        {designs.length === 0 && <p className="text-muted">No designs yet.</p>}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {designs
            .filter((d) => !templates.has(d.id))
            .map((d) => (
              <div key={d.id} className="card overflow-hidden">
                <Link href={`/design/${d.id}`} className="block bg-ink p-3">
                  <JerseyPreview spec={d.spec} player={d.spec.sample} view="front" className="mx-auto h-48" />
                </Link>
                <div className="flex items-start justify-between gap-2 p-3">
                  <div>
                    <div className="font-semibold">{d.title}</div>
                    <div className="text-xs text-muted">{productByKey(d.spec.product)?.label}</div>
                  </div>
                  {!d.locked && (
                    <button onClick={() => remove(d.id)} className="text-xs text-muted hover:text-red-400">
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
        </div>
      </div>
    </section>
  );
}
