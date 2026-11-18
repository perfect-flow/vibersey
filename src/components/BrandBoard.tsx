"use client";

import { useEffect, useState } from "react";
import { FONTS, applyBrand, brandFromSpec, type Brand, type DesignSpec, type FontKey } from "@/lib/design-spec";

type Saved = { id: string; name: string; brand: Brand };

const ROLE_LABELS: Record<keyof Brand["colors"], string> = {
  primary: "Main",
  secondary: "Second",
  accent: "Accent",
  text: "Letters",
  outline: "Outline",
};

const checker = { background: "repeating-conic-gradient(#3a3a44 0% 25%, #23232b 0% 50%) 50% / 10px 10px" };

// The team's brand board: colors, fonts, style and logos that every AI edit
// keeps. Built by the AI from the first chat messages, editable here, and
// saved to the customer's library to reuse on other jerseys.
export function BrandBoard({
  spec,
  locked,
  commit,
  onOpenLogos,
  onNotice,
}: {
  spec: DesignSpec;
  locked: boolean;
  // apply a change to the design and save it right away
  commit: (fn: (s: DesignSpec) => DesignSpec) => void | Promise<void>;
  onOpenLogos: () => void;
  onNotice: (msg: string) => void;
}) {
  const brand = spec.brand;
  const [saved, setSaved] = useState<Saved[]>([]);
  const [unavailable, setUnavailable] = useState(false);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(true);

  const loadSaved = () =>
    fetch("/api/brands")
      .then((r) => r.json())
      .then((d) => {
        setSaved(d.brands ?? []);
        setUnavailable(!!d.unavailable);
      })
      .catch(() => {});
  useEffect(() => {
    loadSaved();
  }, []);

  // change the brand and carry the change onto the jersey
  const editBrand = (fn: (b: Brand, s: DesignSpec) => { brand: Brand; spec?: Partial<DesignSpec> }) =>
    commit((s) => {
      const cur = s.brand ?? brandFromSpec(s);
      const r = fn(structuredClone(cur), s);
      return { ...s, ...(r.spec ?? {}), brand: r.brand };
    });

  function setColor(role: keyof Brand["colors"], value: string) {
    const v = value.toUpperCase();
    editBrand((b, s) => {
      const old = b.colors[role].toUpperCase();
      b.colors[role] = v;
      // jersey colors that used the old brand color follow it
      const colors = { ...s.colors };
      for (const k of Object.keys(colors) as (keyof DesignSpec["colors"])[]) if (colors[k].toUpperCase() === old) colors[k] = v;
      return { brand: b, spec: { colors } };
    });
  }

  function setFont(role: keyof Brand["fonts"], font: FontKey) {
    editBrand((b, s) => {
      b.fonts[role] = font;
      if (role === "wordmark") return { brand: b, spec: { wordmark: { ...s.wordmark, font } } };
      return { brand: b, spec: { lettering: { ...s.lettering, [role === "number" ? "numberFont" : "nameFont"]: font } } };
    });
  }

  async function save() {
    if (!brand) return;
    setSaving(true);
    const res = await fetch("/api/brands", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brand }) });
    const d = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) return onNotice(d.error ?? "Couldn't save the brand.");
    await commit((s) => (s.brand ? { ...s, brand: { ...s.brand, savedId: d.id } } : s));
    onNotice(`Saved "${brand.name || "My brand"}" to your brands. Pick it on any jersey to start on-brand.`);
    loadSaved();
  }

  function applySaved(id: string) {
    const s = saved.find((x) => x.id === id);
    if (!s) return;
    commit((spec) => applyBrand(spec, { ...s.brand, savedId: s.id }));
    onNotice(`Applied the ${s.name} brand. The AI will keep these colors and logos on every edit.`);
  }

  const savedPicker = saved.length > 0 && (
    <select className="input max-w-[220px] py-1 text-sm" value="" disabled={locked} onChange={(e) => e.target.value && applySaved(e.target.value)}>
      <option value="">Use a saved brand…</option>
      {saved.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );

  if (!brand) {
    return (
      <div className="card space-y-3 p-4">
        <div className="flex items-center justify-between">
          <span className="font-semibold">Brand board</span>
          <span className="text-xs text-muted">Keeps colors and logos the same on every edit</span>
        </div>
        <p className="text-sm text-muted">
          No brand board yet. Tell the AI designer your colors and logo (or share an image or link) and it will build one. You can also start from this jersey.
        </p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost px-3 py-1 text-sm" disabled={locked} onClick={() => commit((s) => ({ ...s, brand: brandFromSpec(s) }))}>
            Create from this jersey
          </button>
          <button className="btn-ghost px-3 py-1 text-sm" disabled={locked} onClick={onOpenLogos}>
            Logos &amp; patches
          </button>
          {savedPicker}
        </div>
      </div>
    );
  }

  return (
    <div className="card space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button className="flex items-center gap-2 font-semibold" onClick={() => setOpen(!open)} aria-expanded={open}>
          Brand board{brand.name ? `: ${brand.name}` : ""}
          <span className="text-xs text-muted">{open ? "▾" : "▸"}</span>
        </button>
        <div className="flex gap-1">
          {Object.values(brand.colors).map((c, i) => (
            <span key={i} className="h-5 w-5 rounded-full border border-line" style={{ background: c }} />
          ))}
        </div>
      </div>
      {open && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <span className="label">Team / brand name</span>
              <input
                className="input"
                value={brand.name}
                maxLength={40}
                disabled={locked}
                onChange={(e) => editBrand((b) => ({ brand: { ...b, name: e.target.value } }))}
              />
            </div>
            <div>
              <span className="label">Style</span>
              <input
                className="input"
                value={brand.style}
                maxLength={300}
                placeholder="e.g. minimal, aggressive, 90s throwback"
                disabled={locked}
                onChange={(e) => editBrand((b) => ({ brand: { ...b, style: e.target.value } }))}
              />
            </div>
          </div>

          <div>
            <span className="label">Brand colors</span>
            <div className="flex flex-wrap items-center gap-3">
              {(Object.keys(ROLE_LABELS) as (keyof Brand["colors"])[]).map((k) => (
                <label key={k} className="flex items-center gap-2 text-xs text-muted">
                  <input
                    type="color"
                    value={brand.colors[k]}
                    disabled={locked}
                    onChange={(e) => setColor(k, e.target.value)}
                    className="h-8 w-8 cursor-pointer rounded border border-line bg-transparent"
                  />
                  {ROLE_LABELS[k]}
                </label>
              ))}
              {brand.extras.map((c, i) => (
                <span key={i} className="flex items-center gap-1 text-xs text-muted">
                  <input
                    type="color"
                    value={c}
                    disabled={locked}
                    onChange={(e) => editBrand((b) => ({ brand: { ...b, extras: b.extras.map((x, j) => (j === i ? e.target.value.toUpperCase() : x)) } }))}
                    className="h-8 w-8 cursor-pointer rounded border border-line bg-transparent"
                  />
                  <button
                    className="underline"
                    disabled={locked}
                    aria-label="Remove color"
                    onClick={() => editBrand((b) => ({ brand: { ...b, extras: b.extras.filter((_, j) => j !== i) } }))}
                  >
                    ×
                  </button>
                </span>
              ))}
              {brand.extras.length < 4 && (
                <button
                  className="btn-ghost px-2 py-1 text-xs"
                  disabled={locked}
                  onClick={() => editBrand((b) => ({ brand: { ...b, extras: [...b.extras, "#888888"] } }))}
                >
                  + Color
                </button>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {(
              [
                ["Team name font", "wordmark"],
                ["Number font", "number"],
                ["Name font", "name"],
              ] as const
            ).map(([label, role]) => (
              <div key={role}>
                <span className="label">{label}</span>
                <select className="input" value={brand.fonts[role]} disabled={locked} onChange={(e) => setFont(role, e.target.value as FontKey)}>
                  {Object.entries(FONTS).map(([k, f]) => (
                    <option key={k} value={k}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div>
            <span className="label">Logos</span>
            <div className="flex flex-wrap items-center gap-3">
              {(
                [
                  ["Main", brand.logos.main],
                  ["Alternate", brand.logos.alternate],
                ] as const
              ).map(([label, logo]) => (
                <div key={label} className="flex items-center gap-2 text-xs text-muted">
                  {logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logo.url} alt={`${label} logo`} className="h-12 w-12 rounded object-contain" style={checker} />
                  ) : (
                    <span className="grid h-12 w-12 place-items-center rounded border border-dashed border-line">none</span>
                  )}
                  {label}
                </div>
              ))}
              <button className="btn-ghost px-3 py-1 text-sm" disabled={locked} onClick={onOpenLogos}>
                Logos &amp; patches
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <button className="btn-ghost px-3 py-1 text-sm" disabled={locked || saving || unavailable} onClick={save} title={unavailable ? "Saving brands needs a database update" : undefined}>
              {saving ? "Saving…" : brand.savedId ? "Update saved brand" : "Save to my brands"}
            </button>
            <button
              className="btn-ghost px-3 py-1 text-sm"
              disabled={locked}
              title="Reset the jersey's colors, fonts and logos to the brand"
              onClick={() => commit((s) => (s.brand ? applyBrand(s, s.brand) : s))}
            >
              Apply brand to jersey
            </button>
            {savedPicker}
            <button
              className="ml-auto text-xs text-muted underline"
              disabled={locked}
              onClick={() => commit((s) => ({ ...s, brand: null }))}
              title="The AI will stop holding edits to this brand"
            >
              Remove brand board
            </button>
          </div>
        </>
      )}
    </div>
  );
}
