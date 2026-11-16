"use client";

import { use, useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import { JerseyPreview } from "@/components/JerseyPreview";
import { ModelPreviewButton } from "@/components/ModelPreview";
import { COLOR_KEYS, COLOR_LABELS, COLORWAY_PRESETS, applyColors, colorway, type Colors, type ColorwayPreset } from "@/lib/colorways";
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
type Kit = { id: string | null; label: string; design_id: string; spec: DesignSpec };
type KitDraft = { preset: ColorwayPreset | "custom"; label: string; colors: Colors };
const PRESET_NAMES: Record<ColorwayPreset | "custom", string> = { white: "Away", dark: "Alternate", swap: "Third", custom: "Alternate" };
type NewEntry = { player_name: string; number: string; size: string; quantity: number; email?: string | null };

export default function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [team, setTeam] = useState<Team | null>(null);
  const [spec, setSpec] = useState<DesignSpec | null>(null);
  const [kits, setKits] = useState<Kit[]>([]);
  const [activeKit, setActiveKit] = useState(0);
  const [orderKits, setOrderKits] = useState<string[]>([]); // design ids to order
  const [kitDraft, setKitDraft] = useState<KitDraft | null>(null);
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
      const k: Kit[] = d.kits?.length ? d.kits : [{ id: null, label: "Home", design_id: d.design.id, spec: d.design.spec }];
      setKits(k);
      setOrderKits([k[0].design_id]);
      setRoster(d.roster);
      const prods = (await (await fetch("/api/products")).json()).products as { key: string; sizes: { size: string; price: number }[] }[];
      const def = productByKey(d.design.spec.product);
      setSizes([...(prods.find((p) => p.key === def?.key)?.sizes ?? []), ...(prods.find((p) => p.key === def?.youthKey)?.sizes ?? [])]);
    });
  }, [id]);

  const priceOf = (size: string) => sizes.find((s) => s.size.toUpperCase() === size.toUpperCase())?.price ?? 0;
  const open = roster.filter((e) => !e.order_id);
  const kitCount = Math.max(1, orderKits.length);
  const total = useMemo(() => open.reduce((s, e) => s + priceOf(e.size) * e.quantity, 0) * kitCount, [open, sizes, kitCount]); // eslint-disable-line react-hooks/exhaustive-deps

  function startKit(preset: ColorwayPreset | "custom") {
    if (!spec) return;
    const used = new Set(kits.map((k) => k.label.toLowerCase()));
    let label = PRESET_NAMES[preset];
    for (let n = 2; used.has(label.toLowerCase()); n++) label = `${PRESET_NAMES[preset]} ${n}`;
    setKitDraft({ preset, label, colors: preset === "custom" ? { ...spec.colors } : colorway(spec.colors, preset) });
  }

  async function saveKit() {
    if (!kitDraft) return;
    setBusy(true);
    const r = await fetch(`/api/teams/${id}/kits`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: kitDraft.label, colors: kitDraft.colors }),
    });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) return setMsg(d.error);
    setKits((k) => [...k, d.kit]);
    setActiveKit(kits.length);
    setKitDraft(null);
    setMsg(`${d.kit.label} kit added. Pick which kits to order below.`);
  }

  async function removeKit(kit: Kit) {
    if (!kit.id) return;
    const r = await fetch(`/api/teams/${id}/kits?kitId=${kit.id}`, { method: "DELETE" });
    if (!r.ok) return setMsg("Couldn't remove that kit.");
    setKits((k) => k.filter((x) => x.design_id !== kit.design_id));
    setOrderKits((o) => o.filter((x) => x !== kit.design_id));
    setActiveKit(0);
  }
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
      body: JSON.stringify({ mode: "team", teamId: id, kitDesignIds: orderKits }),
    });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) return setMsg(d.error);
    window.location.href = d.url;
  }

  if (!team || !spec) return <div className="p-10 text-center text-muted">{msg ?? "Loading team…"}</div>;
  const unknownSizes = open.filter((e) => !priceOf(e.size));
  const shownSpec = kitDraft ? applyColors(spec, kitDraft.colors) : (kits[activeKit]?.spec ?? spec);

  return (
    <section className="mx-auto grid max-w-7xl gap-6 px-4 py-8 lg:grid-cols-[380px_1fr]">
      <div className="space-y-4">
        <div>
          <h1 className="font-display text-5xl tracking-wide">{team.name}</h1>
          <p className="text-sm text-muted">Every jersey uses this exact design and fonts. Only the name and number change, and extra kits change only the colors.</p>
        </div>
        <div className="card p-4">
          <JerseyPreview spec={shownSpec} player={selected ?? spec.sample} view={view} className="mx-auto h-80" />
          <div className="mt-2 flex justify-center gap-3 text-xs text-muted">
            <button className={view === "front" ? "text-volt" : ""} onClick={() => setView("front")}>Front</button>
            <button className={view === "back" ? "text-volt" : ""} onClick={() => setView("back")}>Back</button>
          </div>
          {!kitDraft && kits[activeKit] && (
            <div className="mt-3 text-center">
              <ModelPreviewButton
                key={kits[activeKit].design_id}
                getDesignId={async () => kits[activeKit].design_id}
                player={selected ?? spec.sample}
                label={`See ${kits[activeKit].label} on a model`}
              />
            </div>
          )}
        </div>

        <div className="card space-y-3 p-4">
          <div>
            <span className="font-semibold">Kits</span>
            <p className="text-xs text-muted">Same design, players, names and numbers in different colors, like home and away.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {kits.map((k, i) => (
              <span key={k.design_id} className={`flex items-center gap-1 rounded-full border px-3 py-1 text-sm ${i === activeKit && !kitDraft ? "border-[var(--color-volt)]" : "border-line"}`}>
                <button
                  onClick={() => {
                    setKitDraft(null);
                    setActiveKit(i);
                  }}
                  className="flex items-center gap-1"
                >
                  <span className="h-3 w-3 rounded-full border border-white/30" style={{ background: k.spec.colors.primary }} />
                  {k.label}
                </button>
                {k.id && (
                  <button onClick={() => removeKit(k)} className="text-xs text-muted hover:text-red-400" aria-label={`Remove ${k.label} kit`}>
                    ×
                  </button>
                )}
              </span>
            ))}
          </div>
          {!kitDraft ? (
            kits.length < 6 && (
              <div>
                <span className="label">Add a kit</span>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(COLORWAY_PRESETS) as ColorwayPreset[]).map((p) => (
                    <button key={p} className="btn-ghost text-sm" title={COLORWAY_PRESETS[p].hint} onClick={() => startKit(p)}>
                      {COLORWAY_PRESETS[p].label}
                    </button>
                  ))}
                  <button className="btn-ghost text-sm" onClick={() => startKit("custom")}>
                    Custom colors
                  </button>
                </div>
              </div>
            )
          ) : (
            <div className="space-y-3 rounded border border-line p-3">
              <div>
                <span className="label">Kit name</span>
                <input className="input" maxLength={30} value={kitDraft.label} onChange={(e) => setKitDraft({ ...kitDraft, label: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                {COLOR_KEYS.map((c) => (
                  <label key={c} className="flex items-center gap-2 text-xs text-muted">
                    <input
                      type="color"
                      value={kitDraft.colors[c]}
                      onChange={(e) => setKitDraft({ ...kitDraft, preset: "custom", colors: { ...kitDraft.colors, [c]: e.target.value.toUpperCase() } })}
                      className="h-8 w-10 cursor-pointer rounded border border-line bg-transparent"
                    />
                    {COLOR_LABELS[c]}
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted">The layout, graphics, fonts and logo stay locked. Only these colors change.</p>
              <div className="flex gap-2">
                <button className="btn-primary" disabled={busy || !kitDraft.label.trim()} onClick={saveKit}>
                  Save kit
                </button>
                <button className="btn-ghost" onClick={() => setKitDraft(null)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
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
              {open.length} player{open.length === 1 ? "" : "s"} not yet ordered
              {kitCount > 1 && ` · ${open.length * kitCount} jerseys (${kitCount} kits each)`}
            </div>
            {kits.length > 1 && (
              <div className="my-2 flex flex-wrap gap-3 text-sm">
                {kits.map((k) => (
                  <label key={k.design_id} className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={orderKits.includes(k.design_id)}
                      onChange={(e) =>
                        setOrderKits((o) => (e.target.checked ? [...o, k.design_id] : o.filter((x) => x !== k.design_id)))
                      }
                    />
                    {k.label}
                  </label>
                ))}
              </div>
            )}
            <div className="text-xs text-muted">
              {unknownSizes.length ? `${unknownSizes.length} player(s) have a size we don't offer. Fix them before ordering.` : "Plus shipping at checkout."}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-display text-4xl text-volt">{fmt(total)}</span>
            <button className="btn-primary" onClick={orderAll} disabled={busy || !open.length || !orderKits.length || unknownSizes.length > 0}>
              Order for the team
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
