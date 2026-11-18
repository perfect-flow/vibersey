"use client";

import { useState } from "react";
import {
  LOGO_POSITIONS,
  PATCH_GUIDANCE,
  PATCH_POSITIONS,
  PATCH_POSITION_LABELS,
  DEFAULT_PATCH_POSITION,
  productByKey,
  STANDARDS,
  type LogoPosition,
  type PatchPosition,
} from "@/lib/catalog";
import { DEFAULT_PATCHES, brandFromSpec, brandPalette, type DesignSpec, type LogoAsset } from "@/lib/design-spec";
import { patchSpotFits } from "@/lib/render";

const LOGO_POSITION_LABELS: Record<LogoPosition, string> = {
  auto: "Standard spot",
  above_name: "Above team name",
  center_chest: "Center chest (big)",
  left_chest: "Left chest",
  right_chest: "Right chest",
  sleeves: "Sleeves",
  upper_back: "Upper back",
};

const checker = { background: "repeating-conic-gradient(#3a3a44 0% 25%, #23232b 0% 50%) 50% / 10px 10px" };

type Slot = "main" | "alternate";

// The logo and patch builder, separate from the design chat: upload or
// generate the main logo and an alternate (shoulder) logo, edit either with a
// prompt, and place patches where the sport usually wears them.
export function LogoBuilder({
  spec,
  locked,
  commit,
  upload,
  onClose,
  onSignup,
  onUsage,
}: {
  spec: DesignSpec;
  locked: boolean;
  commit: (fn: (s: DesignSpec) => DesignSpec) => void | Promise<void>;
  // uploads a logo file (background removed) and returns its URL
  upload: (file: File) => Promise<string | null>;
  onClose: () => void;
  onSignup: (reason: string) => void;
  onUsage?: (u: { used: number; limit: number | null; allowed: boolean }) => void;
}) {
  const product = productByKey(spec.product)!;
  const patches = spec.patches ?? DEFAULT_PATCHES;
  const brand = spec.brand;
  const main: LogoAsset | null = brand?.logos.main ?? (spec.logo.url && spec.logo.source ? { url: spec.logo.url, source: spec.logo.source, prompt: spec.logo.prompt } : null);
  const alternate: LogoAsset | null = brand?.logos.alternate ?? (patches.alternate.url ? { url: patches.alternate.url, source: "upload", prompt: null } : null);

  const [prompts, setPrompts] = useState<Record<Slot, string>>({ main: "", alternate: "" });
  const [busy, setBusy] = useState<Slot | null>(null);
  const [busyMode, setBusyMode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // every logo made or uploaded in this session, so the customer can go back
  const [history, setHistory] = useState<Record<Slot, string[]>>({ main: main ? [main.url] : [], alternate: alternate ? [alternate.url] : [] });

  // put a logo in a slot: on the brand board and on the jersey
  function setLogo(slot: Slot, asset: LogoAsset) {
    setHistory((h) => ({ ...h, [slot]: h[slot].includes(asset.url) ? h[slot] : [...h[slot], asset.url] }));
    return commit((s) => {
      const b = s.brand ?? brandFromSpec(s);
      const p = s.patches ?? DEFAULT_PATCHES;
      if (slot === "main") {
        return { ...s, brand: { ...b, logos: { ...b.logos, main: asset } }, logo: { ...s.logo, url: asset.url, source: asset.source, prompt: asset.prompt } };
      }
      return {
        ...s,
        brand: { ...b, logos: { ...b.logos, alternate: asset } },
        patches: { ...p, alternate: { ...p.alternate, url: asset.url, show: true } },
      };
    });
  }

  async function generate(slot: Slot, mode: "new" | "edit" | "derive") {
    const prompt = prompts[slot].trim() || (mode === "derive" ? "A simpler secondary mark: the main subject alone inside a circle" : "");
    if (!prompt) return setError(mode === "edit" ? "Describe the change, e.g. \"make the horse white\"." : "Describe the logo you want.");
    setError(null);
    setBusy(slot);
    setBusyMode(mode);
    const current = slot === "main" ? main : alternate;
    const reference = mode === "edit" ? current?.url : mode === "derive" ? main?.url : null;
    const res = await fetch("/api/brand/logo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: slot,
        mode: mode === "edit" ? "edit" : "new",
        prompt,
        sport: spec.sport,
        colors: brand ? brandPalette(brand).filter((c) => c !== "#000000" && c !== "#FFFFFF").concat(["#FFFFFF"]) : [spec.colors.primary, spec.colors.secondary, spec.colors.accent],
        style: brand?.style || undefined,
        reference: reference ?? null,
      }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(null);
    if (d.usage && onUsage) onUsage(d.usage);
    if (res.status === 402) return onSignup("You've used your free designs. Create a free account to keep making logos.");
    if (!res.ok || !d.url) return setError(d.error ?? "Couldn't make that logo. Please try again.");
    await setLogo(slot, { url: d.url, source: "ai", prompt });
    setPrompts((p) => ({ ...p, [slot]: "" }));
  }

  async function onFile(slot: Slot, file: File) {
    setBusy(slot);
    setBusyMode("upload");
    setError(null);
    const url = await upload(file);
    setBusy(null);
    if (url) await setLogo(slot, { url, source: "upload", prompt: null });
  }

  const altSpots = PATCH_POSITIONS.filter((p) => patchSpotFits(spec, p, "alternate"));
  const capSpots = PATCH_POSITIONS.filter((p) => patchSpotFits(spec, p, "captain"));
  const autoLabel = (kind: "alternate" | "captain") => `Standard (${PATCH_POSITION_LABELS[DEFAULT_PATCH_POSITION[spec.sport][kind]].toLowerCase()})`;
  const setPatch = <K extends "alternate" | "captain">(kind: K, patch: Partial<DesignSpec["patches"][K]>) =>
    commit((s) => {
      const p = s.patches ?? DEFAULT_PATCHES;
      return { ...s, patches: { ...p, [kind]: { ...p[kind], ...patch } } };
    });

  const slotUi = (slot: Slot, asset: LogoAsset | null) => (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        {asset ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={asset.url} alt={`${slot} logo`} className="h-24 w-24 shrink-0 rounded-lg object-contain" style={checker} />
        ) : (
          <div className="grid h-24 w-24 shrink-0 place-items-center rounded-lg border border-dashed border-line text-xs text-muted">No logo yet</div>
        )}
        <div className="flex-1 space-y-2">
          <textarea
            className="input min-h-[64px] text-sm"
            placeholder={
              asset
                ? 'Describe a change ("make the horse white, add a cowboy hat") or a new logo'
                : slot === "main"
                  ? "Describe your logo, e.g. a bucking bronco in a circle, minimal"
                  : "Describe the alternate mark, or leave blank to base it on the main logo"
            }
            value={prompts[slot]}
            disabled={locked || busy !== null}
            onChange={(e) => setPrompts((p) => ({ ...p, [slot]: e.target.value }))}
          />
          <div className="flex flex-wrap gap-2">
            {asset && (
              <button className="btn-primary px-3 py-1 text-sm" disabled={locked || busy !== null} onClick={() => generate(slot, "edit")}>
                {busy === slot && busyMode === "edit" ? "Working…" : "Edit this logo"}
              </button>
            )}
            {slot === "alternate" && main && (
              <button className={`${asset ? "btn-ghost" : "btn-primary"} px-3 py-1 text-sm`} disabled={locked || busy !== null} onClick={() => generate(slot, "derive")}>
                {busy === slot && busyMode === "derive" ? "Working…" : "Make from main logo"}
              </button>
            )}
            <button className="btn-ghost px-3 py-1 text-sm" disabled={locked || busy !== null} onClick={() => generate(slot, "new")}>
              {busy === slot && busyMode === "new" ? "Working…" : "Generate new"}
            </button>
            <label className={`btn-ghost cursor-pointer px-3 py-1 text-sm ${locked || busy !== null ? "pointer-events-none opacity-50" : ""}`}>
              {busy === slot && busyMode === "upload" ? "Uploading…" : "Upload"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) onFile(slot, f);
                }}
              />
            </label>
          </div>
        </div>
      </div>
      {history[slot].length > 1 && (
        <div>
          <span className="label">Versions (tap to use)</span>
          <div className="flex flex-wrap gap-2">
            {history[slot].map((u) => (
              <button
                key={u}
                disabled={locked}
                onClick={() => setLogo(slot, { url: u, source: "ai", prompt: null })}
                className={`rounded-lg border p-0.5 ${asset?.url === u ? "border-volt" : "border-line"}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={u} alt="" className="h-12 w-12 rounded object-contain" style={checker} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4" onClick={onClose}>
      <div className="card my-8 w-full max-w-2xl space-y-5 bg-panel p-5" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Logos and patches">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-3xl tracking-wide">Logos &amp; patches</h2>
          <button className="btn-ghost px-3 py-1 text-sm" onClick={onClose}>
            Done
          </button>
        </div>
        <p className="rounded-lg border border-line bg-ink p-3 text-sm text-muted">
          <span className="font-semibold text-white">{STANDARDS[spec.sport].label} layout. </span>
          {PATCH_GUIDANCE[spec.sport]}
        </p>
        {error && <p className="text-sm text-red-400">{error}</p>}

        <section className="space-y-3">
          <h3 className="font-semibold">Main logo</h3>
          {slotUi("main", main)}
          {main && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <span className="label">Where it goes</span>
                <select
                  className="input"
                  value={spec.logo.position ?? "auto"}
                  disabled={locked}
                  onChange={(e) => commit((s) => ({ ...s, logo: { ...s.logo, position: e.target.value as LogoPosition, offsetX: 0, offsetY: 0 } }))}
                >
                  {LOGO_POSITIONS.filter((p) => p !== "sleeves" || product.placements.includes("sleeve_left")).map((p) => (
                    <option key={p} value={p}>
                      {LOGO_POSITION_LABELS[p]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <span className="label">Size</span>
                <input
                  type="range"
                  min={0.5}
                  max={3}
                  step={0.1}
                  value={spec.logo.scale ?? 1}
                  disabled={locked}
                  onChange={(e) => commit((s) => ({ ...s, logo: { ...s.logo, scale: Number(e.target.value) } }))}
                  className="mt-3 w-full accent-[var(--color-volt)]"
                />
              </div>
            </div>
          )}
        </section>

        <section className="space-y-3 border-t border-line pt-4">
          <h3 className="font-semibold">Alternate logo (shoulder badge)</h3>
          <p className="text-xs text-muted">A simpler secondary mark that works small, worn as a patch.</p>
          {slotUi("alternate", alternate)}
          {alternate && (
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="flex items-center gap-2 text-sm text-muted">
                <input type="checkbox" checked={patches.alternate.show} disabled={locked} onChange={(e) => setPatch("alternate", { show: e.target.checked })} />
                Show on jersey
              </label>
              <div>
                <span className="label">Where it goes</span>
                <select className="input" value={patches.alternate.position} disabled={locked} onChange={(e) => setPatch("alternate", { position: e.target.value as PatchPosition, show: true })}>
                  {altSpots.map((p) => (
                    <option key={p} value={p}>
                      {p === "auto" ? autoLabel("alternate") : PATCH_POSITION_LABELS[p]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <span className="label">Size</span>
                <input
                  type="range"
                  min={0.5}
                  max={2}
                  step={0.1}
                  value={patches.alternate.scale}
                  disabled={locked}
                  onChange={(e) => setPatch("alternate", { scale: Number(e.target.value) })}
                  className="mt-3 w-full accent-[var(--color-volt)]"
                />
              </div>
            </div>
          )}
        </section>

        <section className="space-y-3 border-t border-line pt-4">
          <h3 className="font-semibold">Captain patch</h3>
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                ["none", "None"],
                ["C", "C · Captain"],
                ["A", "A · Alternate"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                disabled={locked}
                onClick={() => setPatch("captain", { letter: v })}
                className={`btn-ghost px-3 py-1 text-sm ${patches.captain.letter === v ? "border-volt text-volt" : ""}`}
              >
                {label}
              </button>
            ))}
          </div>
          {patches.captain.letter !== "none" && (
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <span className="label">Style</span>
                <select className="input" value={patches.captain.style} disabled={locked} onChange={(e) => setPatch("captain", { style: e.target.value as "letter" | "patch" })}>
                  <option value="letter">Outlined letter</option>
                  <option value="patch">Letter on a patch</option>
                </select>
              </div>
              <div>
                <span className="label">Where it goes</span>
                <select className="input" value={patches.captain.position} disabled={locked} onChange={(e) => setPatch("captain", { position: e.target.value as PatchPosition })}>
                  {capSpots.map((p) => (
                    <option key={p} value={p}>
                      {p === "auto" ? autoLabel("captain") : PATCH_POSITION_LABELS[p]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <span className="label">Size</span>
                <input
                  type="range"
                  min={0.5}
                  max={2}
                  step={0.1}
                  value={patches.captain.scale}
                  disabled={locked}
                  onChange={(e) => setPatch("captain", { scale: Number(e.target.value) })}
                  className="mt-3 w-full accent-[var(--color-volt)]"
                />
              </div>
            </div>
          )}
          <p className="text-xs text-muted">The letter prints on this jersey. For a team, give the captain&apos;s jersey its own copy of the design.</p>
        </section>
      </div>
    </div>
  );
}
