"use client";

import { use, useEffect, useState } from "react";
import { JerseyPreview } from "@/components/JerseyPreview";
import { ModelPreviewButton } from "@/components/ModelPreview";
import { productByKey } from "@/lib/catalog";
import type { DesignSpec } from "@/lib/design-spec";
import { fmt } from "@/lib/pricing";

// Shareable team link: a player enters their name, number and size and pays.
export default function TeamMemberOrder({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [team, setTeam] = useState<{ name: string } | null>(null);
  const [spec, setSpec] = useState<DesignSpec | null>(null);
  const [kits, setKits] = useState<{ label: string; design_id: string; spec: DesignSpec }[]>([]);
  const [shown, setShown] = useState(0);
  const [picked, setPicked] = useState<string[]>([]);
  const [sizes, setSizes] = useState<{ size: string; price: number }[]>([]);
  const [form, setForm] = useState({ player_name: "", number: "", size: "", quantity: 1, email: "" });
  const [view, setView] = useState<"front" | "back">("back");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/t/${slug}`).then(async (r) => {
      const d = await r.json();
      if (!r.ok) return setError(d.error);
      setTeam(d.team);
      setSpec(d.design.spec);
      const k = d.kits?.length ? d.kits : [{ label: "Home", design_id: d.design.id, spec: d.design.spec }];
      setKits(k);
      setPicked([k[0].design_id]);
      const def = productByKey(d.design.spec.product);
      const prods = (await (await fetch("/api/products")).json()).products as { key: string; sizes: { size: string; price: number }[] }[];
      setSizes([...(prods.find((p) => p.key === def?.key)?.sizes ?? []), ...(prods.find((p) => p.key === def?.youthKey)?.sizes ?? [])]);
    });
  }, [slug]);

  async function checkout(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "member", slug, entry: { ...form, email: form.email || null }, kitDesignIds: picked }),
    });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) return setError(d.error);
    window.location.href = d.url;
  }

  if (!spec || !team) return <div className="p-10 text-center text-muted">{error ?? "Loading…"}</div>;
  const unit = sizes.find((s) => s.size === form.size)?.price;
  const price = unit ? unit * Math.max(1, picked.length) : undefined;
  const kit = kits[shown] ?? { spec, design_id: "", label: "Home" };
  const player = { name: form.player_name || spec.sample.name, number: form.number || spec.sample.number };

  return (
    <section className="mx-auto grid max-w-5xl gap-8 px-4 py-10 md:grid-cols-2">
      <div className="card p-4">
        {kits.length > 1 && (
          <div className="mb-2 flex justify-center gap-2 text-sm">
            {kits.map((k, i) => (
              <button key={k.design_id} onClick={() => setShown(i)} className={`rounded-full border px-3 py-1 ${i === shown ? "border-[var(--color-volt)]" : "border-line"}`}>
                {k.label}
              </button>
            ))}
          </div>
        )}
        <JerseyPreview spec={kit.spec} player={player} view={view} className="mx-auto h-[420px]" />
        <div className="mt-2 flex justify-center gap-3 text-xs text-muted">
          <button className={view === "front" ? "text-volt" : ""} onClick={() => setView("front")}>Front</button>
          <button className={view === "back" ? "text-volt" : ""} onClick={() => setView("back")}>Back</button>
        </div>
        {kit.design_id && (
          <div className="mt-3 text-center">
            <ModelPreviewButton key={kit.design_id} getDesignId={async () => kit.design_id} player={player} label={kits.length > 1 ? `See ${kit.label} on a model` : undefined} />
          </div>
        )}
      </div>
      <form onSubmit={checkout} className="space-y-4">
        <div>
          <p className="text-sm uppercase tracking-wider text-muted">Team order</p>
          <h1 className="font-display text-5xl tracking-wide">{team.name}</h1>
          <p className="text-sm text-muted">Enter your name, number and size. Your jersey matches the team design exactly.</p>
        </div>
        {kits.length > 1 && (
          <div>
            <span className="label">Kits</span>
            <div className="flex flex-wrap gap-4 text-sm">
              {kits.map((k) => (
                <label key={k.design_id} className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={picked.includes(k.design_id)}
                    onChange={(e) => setPicked((p) => (e.target.checked ? [...p, k.design_id] : p.filter((x) => x !== k.design_id)))}
                  />
                  {k.label}
                </label>
              ))}
            </div>
          </div>
        )}
        <div>
          <span className="label">Name on back</span>
          <input className="input" maxLength={16} value={form.player_name} onChange={(e) => setForm({ ...form, player_name: e.target.value.toUpperCase() })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="label">Number</span>
            <input className="input" maxLength={3} inputMode="numeric" value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value.replace(/\D/g, "") })} />
          </div>
          <div>
            <span className="label">Size</span>
            <select className="input" required value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })}>
              <option value="">Choose</option>
              {sizes.map((s) => (
                <option key={s.size} value={s.size}>
                  {s.size} · {fmt(s.price)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="label">Quantity</span>
            <input className="input" type="number" min={1} max={10} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Math.max(1, Number(e.target.value)) })} />
          </div>
          <div>
            <span className="label">Email</span>
            <input className="input" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button className="btn-primary w-full" disabled={busy || !form.size || !picked.length}>
          {price ? `Pay ${fmt(price * form.quantity)} + shipping` : "Continue to payment"}
        </button>
      </form>
    </section>
  );
}
