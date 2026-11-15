"use client";

import { use, useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import { JerseyPreview } from "@/components/JerseyPreview";
import { productByKey } from "@/lib/catalog";
import type { DesignSpec } from "@/lib/design-spec";
import { fmt } from "@/lib/pricing";

type Entry = {
  id: string;
  player_name: string;
  number: string;
  size: string;
  quantity: number;
  email: string | null;
  source: string;
  order_id: string | null;
};
type Team = { id: string; name: string; share_slug: string; share_enabled: boolean };
type NewEntry = { player_name: string; number: string; size: string; quantity: number; email?: string | null };

export default function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [team, setTeam] = useState<Team | null>(null);
  const [spec, setSpec] = useState<DesignSpec | null>(null);
  const [roster, setRoster] = useState<Entry[]>([]);
  const [sizes, setSizes] = useState<{ size: string; price: number }[]>([]);
  const [draft, setDraft] = useState<NewEntry>({ player_name: "", number: "", size: "", quantity: 1 });
  const [selected, setSelected] = useState<{ name: string; number: string } | null>(null);
  const [view, setView] = useState<"front" | "back">("back");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/teams/${id}`).then(async (r) => {
      if (!r.ok) return setMsg("Team not found, or you need to sign in.");
      const d = await r.json();
      setTeam(d.team);
      setSpec(d.design.spec);
      setRoster(d.roster);
      const prods = (await (await fetch("/api/products")).json()).products as { key: string; sizes: { size: string; price: number }[] }[];
      const def = productByKey(d.design.spec.product);
      setSizes([...(prods.find((p) => p.key === def?.key)?.sizes ?? []), ...(prods.find((p) => p.key === def?.youthKey)?.sizes ?? [])]);
    });
  }, [id]);

  const priceOf = (size: string) => sizes.find((s) => s.size.toUpperCase() === size.toUpperCase())?.price ?? 0;
  const open = roster.filter((e) => !e.order_id);
  const total = useMemo(() => open.reduce((s, e) => s + priceOf(e.size) * e.quantity, 0), [open, sizes]); // eslint-disable-line react-hooks/exhaustive-deps
  const shareUrl = team ? `${typeof window !== "undefined" ? window.location.origin : ""}/t/${team.share_slug}` : "";

  async function add(entries: NewEntry[], source: "manual" | "csv") {
    const r = await fetch(`/api/teams/${id}/roster`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source, entries }),
    });
    const d = await r.json();
    if (!r.ok) return setMsg(d.error);
    setRoster((x) => [...x, ...d.entries]);
    setMsg(`Added ${d.entries.length} player${d.entries.length === 1 ? "" : "s"}.`);
  }

  function importCsv(file: File) {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase(),
      complete: (res) => {
        const pick = (row: Record<string, string>, ...keys: string[]) => keys.map((k) => row[k]).find((v) => v != null && v !== "") ?? "";
        const entries = res.data
          .map((row) => ({
            player_name: pick(row, "name", "player", "player name", "player_name", "last name").slice(0, 16),
            number: pick(row, "number", "no", "#", "jersey number").replace(/\D/g, "").slice(0, 3),
            size: pick(row, "size", "jersey size"),
            quantity: Number(pick(row, "quantity", "qty")) || 1,
            email: pick(row, "email", "e-mail") || null,
          }))
          .filter((e) => e.size);
        if (!entries.length) return setMsg("No rows with a size column found. Columns: name, number, size, quantity, email.");
        add(entries, "csv");
      },
    });
  }

  async function removeEntry(entryId: string) {
    await fetch(`/api/teams/${id}/roster?entryId=${entryId}`, { method: "DELETE" });
    setRoster((x) => x.filter((e) => e.id !== entryId));
  }

  async function toggleShare() {
    if (!team) return;
    const r = await fetch(`/api/teams/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ share_enabled: !team.share_enabled }),
    });
    if (r.ok) setTeam((await r.json()).team);
  }

  async function orderAll() {
    setBusy(true);
    const r = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "team", teamId: id }),
    });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) return setMsg(d.error);
    window.location.href = d.url;
  }

  if (!team || !spec) return <div className="p-10 text-center text-muted">{msg ?? "Loading team…"}</div>;
  const unknownSizes = open.filter((e) => !priceOf(e.size));

  return (
    <section className="mx-auto grid max-w-7xl gap-6 px-4 py-8 lg:grid-cols-[380px_1fr]">
      <div className="space-y-4">
        <div>
          <h1 className="font-display text-5xl tracking-wide">{team.name}</h1>
          <p className="text-sm text-muted">Every jersey uses this exact design and fonts. Only the name and number change.</p>
        </div>
        <div className="card p-4">
          <JerseyPreview spec={spec} player={selected ?? spec.sample} view={view} className="mx-auto h-80" />
          <div className="mt-2 flex justify-center gap-3 text-xs text-muted">
            <button className={view === "front" ? "text-volt" : ""} onClick={() => setView("front")}>Front</button>
            <button className={view === "back" ? "text-volt" : ""} onClick={() => setView("back")}>Back</button>
          </div>
        </div>
        <div className="card space-y-2 p-4">
          <div className="flex items-center justify-between">
            <span className="font-semibold">Share link</span>
            <button onClick={toggleShare} className="text-xs text-muted underline">
              {team.share_enabled ? "Turn off" : "Turn on"}
            </button>
          </div>
          <p className="text-xs text-muted">Players open this link, enter their name, number and size, and pay for their own jersey.</p>
          {team.share_enabled && (
            <div className="flex gap-2">
              <input readOnly className="input text-xs" value={shareUrl} />
              <button className="btn-ghost" onClick={() => navigator.clipboard.writeText(shareUrl).then(() => setMsg("Link copied."))}>
                Copy
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {msg && <p className="text-sm text-volt">{msg}</p>}
        <div className="card p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-3xl tracking-wide">Roster</h2>
            <label className="btn-ghost cursor-pointer">
              Import CSV
              <input type="file" accept=".csv,text/csv" hidden onChange={(e) => e.target.files?.[0] && importCsv(e.target.files[0])} />
            </label>
          </div>
          <p className="mb-3 text-xs text-muted">
            CSV columns: <code>name, number, size, quantity, email</code>. Sizes: {sizes.map((s) => s.size).join(", ") || "available after catalog sync"}.
          </p>
          <form
            className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_80px_120px_70px_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              if (!draft.size) return setMsg("Pick a size.");
              add([draft], "manual");
              setDraft({ player_name: "", number: "", size: draft.size, quantity: 1 });
            }}
          >
            <input className="input" placeholder="Name" maxLength={16} value={draft.player_name} onChange={(e) => setDraft({ ...draft, player_name: e.target.value.toUpperCase() })} />
            <input className="input" placeholder="#" maxLength={3} value={draft.number} onChange={(e) => setDraft({ ...draft, number: e.target.value.replace(/\D/g, "") })} />
            <select className="input" value={draft.size} onChange={(e) => setDraft({ ...draft, size: e.target.value })}>
              <option value="">Size</option>
              {sizes.map((s) => (
                <option key={s.size}>{s.size}</option>
              ))}
            </select>
            <input className="input" type="number" min={1} value={draft.quantity} onChange={(e) => setDraft({ ...draft, quantity: Math.max(1, Number(e.target.value)) })} />
            <button className="btn-primary">Add</button>
          </form>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted">
                <tr>
                  <th className="py-2">Name</th>
                  <th>#</th>
                  <th>Size</th>
                  <th>Qty</th>
                  <th>Price</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {roster.map((e) => (
                  <tr key={e.id} className="cursor-pointer border-t border-line hover:bg-white/5" onClick={() => setSelected({ name: e.player_name, number: e.number })}>
                    <td className="py-2">{e.player_name || "—"}</td>
                    <td>{e.number || "—"}</td>
                    <td className={priceOf(e.size) ? "" : "text-red-400"}>{e.size}</td>
                    <td>{e.quantity}</td>
                    <td>{priceOf(e.size) ? fmt(priceOf(e.size) * e.quantity) : "—"}</td>
                    <td className="text-xs text-muted">{e.order_id ? "Ordered" : e.source === "link" ? "Via link" : "Not ordered"}</td>
                    <td className="text-right">
                      {!e.order_id && (
                        <button
                          onClick={(ev) => {
                            ev.stopPropagation();
                            removeEntry(e.id);
                          }}
                          className="text-xs text-muted hover:text-red-400"
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {roster.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-muted">
                      No players yet. Add them above, import a CSV, or share the link.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <div className="font-semibold">
              {open.length} jersey{open.length === 1 ? "" : "s"} not yet ordered
            </div>
            <div className="text-xs text-muted">
              {unknownSizes.length ? `${unknownSizes.length} player(s) have a size we don't offer. Fix them before ordering.` : "Plus shipping at checkout."}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-display text-4xl text-volt">{fmt(total)}</span>
            <button className="btn-primary" onClick={orderAll} disabled={busy || !open.length || unknownSizes.length > 0}>
              Order for the team
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
