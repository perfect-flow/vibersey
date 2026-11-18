"use client";

import { useState } from "react";
import { LOGO_POSITIONS, PATCH_POSITIONS, PATCH_POSITION_LABELS, type LogoPosition, type PatchPosition } from "@/lib/catalog";
import { FONTS, MULTI_COLOR_PATTERNS, PATTERN_LABELS, PATTERN_STYLES, brandPalette, type DesignSpec, type FontKey, type PatternStyle } from "@/lib/design-spec";
import { patternColorRefs } from "@/lib/render";
import {
  GRAPHIC_LABELS,
  PANEL_EDGES,
  allGraphics,
  hasYokePiece,
  materialize,
  newGraphicId,
  resolveColor,
  toColorRef,
  type ColorRef,
  type Graphic,
  type Trim,
} from "@/lib/graphics";

const LOGO_POSITION_LABELS: Record<LogoPosition, string> = {
  auto: "Standard spot",
  above_name: "Above team name",
  center_chest: "Center chest",
  left_chest: "Left chest",
  right_chest: "Right chest",
  sleeves: "Sleeves",
  upper_back: "Upper back",
};

const EDGE_LABELS: Record<(typeof PANEL_EDGES)[number], string> = {
  straight: "Straight",
  chevron: "Chevron",
  diagonal: "Diagonal",
  double_chevron: "Double chevron",
  star_point: "Star point",
  wave: "Wave",
  zigzag: "Lightning",
  custom: "Custom (AI traced)",
};

type Patch = (fn: (s: DesignSpec) => DesignSpec) => void;

// The colors offered when recoloring a part: the brand palette, or the
// jersey's own colors plus white and black.
function paletteFor(spec: DesignSpec) {
  if (spec.brand) return brandPalette(spec.brand);
  return [...new Set([...Object.values(spec.colors), "#FFFFFF", "#000000"].map((c) => c.toUpperCase()))];
}

export function Swatches({ spec, value, onChange, label }: { spec: DesignSpec; value: string; onChange: (c: ColorRef) => void; label?: string }) {
  const [open, setOpen] = useState(false);
  const current = resolveColor(spec, value).toUpperCase();
  return (
    <span className="relative inline-flex items-center gap-1">
      {label && <span className="text-xs text-muted">{label}</span>}
      <button
        type="button"
        className="h-7 w-7 rounded-full border-2 border-line"
        style={{ background: current }}
        aria-label={`${label ?? "Color"}: change`}
        onClick={() => setOpen(!open)}
      />
      {open && (
        <span className="absolute left-0 top-9 z-30 flex w-max max-w-[260px] flex-wrap gap-1.5 rounded-lg border border-line bg-panel p-2 shadow-xl">
          {paletteFor(spec).map((c) => (
            <button
              key={c}
              type="button"
              aria-label={c}
              className={`h-7 w-7 rounded-full border-2 ${c === current ? "border-volt" : "border-line"}`}
              style={{ background: c }}
              onClick={() => {
                onChange(toColorRef(spec, c));
                setOpen(false);
              }}
            />
          ))}
          <label className="grid h-7 w-7 cursor-pointer place-items-center rounded-full border-2 border-dashed border-line text-xs text-muted" title="Any color">
            +
            <input type="color" className="sr-only" value={current} onChange={(e) => onChange(toColorRef(spec, e.target.value))} />
          </label>
        </span>
      )}
    </span>
  );
}

function FontPick({ value, onChange }: { value: FontKey; onChange: (f: FontKey) => void }) {
  return (
    <select className="input w-auto py-1 text-sm" value={value} onChange={(e) => onChange(e.target.value as FontKey)} aria-label="Font">
      {Object.entries(FONTS).map(([k, f]) => (
        <option key={k} value={k}>
          {f.label}
        </option>
      ))}
    </select>
  );
}

const Btn = (p: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button type="button" {...p} className={`btn-ghost px-2.5 py-1 text-sm ${p.className ?? ""}`} />;
const Toggle = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button type="button" onClick={onClick} className={`rounded-full border px-2.5 py-1 text-xs ${on ? "border-volt text-volt" : "border-line text-muted"}`}>
    {children}
  </button>
);

function TrimEditor({ spec, trim, onChange }: { spec: DesignSpec; trim: Trim; onChange: (t: Trim) => void }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-xs text-muted">Trim</span>
      {trim.map((t, i) => (
        <span key={i} className="flex items-center">
          <Swatches spec={spec} value={t.color} onChange={(c) => onChange(trim.map((x, j) => (j === i ? { ...x, color: c } : x)))} />
          <button type="button" className="ml-0.5 text-xs text-muted" aria-label="Remove trim line" onClick={() => onChange(trim.filter((_, j) => j !== i))}>
            ×
          </button>
        </span>
      ))}
      {trim.length < 3 && (
        <button type="button" className="rounded-full border border-dashed border-line px-2 text-xs text-muted" onClick={() => onChange([...trim, { color: trim.length ? "text" : "accent", width: 0.014 }])}>
          + line
        </button>
      )}
    </span>
  );
}

// The collar's color, or none (the body color runs up to the neck).
function CollarPick({ spec, patch }: { spec: DesignSpec; patch: Patch }) {
  const c = spec.collar?.color ?? "accent";
  return (
    <span className="flex items-center gap-1">
      {c !== "none" ? (
        <>
          <Swatches spec={spec} label="Collar" value={c} onChange={(v) => patch((s) => ({ ...s, collar: { color: v } }))} />
          <button type="button" className="text-xs text-muted" aria-label="No collar color" onClick={() => patch((s) => ({ ...s, collar: { color: "none" } }))}>
            ×
          </button>
        </>
      ) : (
        <button type="button" className="rounded-full border border-dashed border-line px-2 text-xs text-muted" onClick={() => patch((s) => ({ ...s, collar: { color: "accent" } }))}>
          + collar color
        </button>
      )}
    </span>
  );
}

// Small contextual options for whatever is selected on the canvas.
export function ElementToolbar({
  spec,
  selected,
  patch,
  onOpenLogos,
  onDeselect,
}: {
  spec: DesignSpec;
  selected: string;
  patch: Patch;
  onOpenLogos: () => void;
  onDeselect: () => void;
}) {
  const editGraphic = (id: string, fn: (g: Graphic) => Graphic | null) =>
    patch((s0) => {
      const s = materialize(s0);
      const graphics = s.graphics.map((g) => (g.id === id ? fn(g) : g)).filter((g): g is Graphic => !!g);
      return { ...s, graphics };
    });

  let title = "";
  let controls: React.ReactNode = null;

  if (selected === "body") {
    title = "Jersey body";
    const style = spec.pattern.style;
    const multi = MULTI_COLOR_PATTERNS.includes(style);
    const cols = patternColorRefs(spec);
    const setCols = (c: ColorRef[]) => patch((s) => ({ ...s, pattern: { ...s.pattern, colors: c } }));
    controls = (
      <>
        {!multi && <Swatches spec={spec} label="Body" value="primary" onChange={(c) => patch((s) => ({ ...s, colors: { ...s.colors, primary: resolveColor(s, c) } }))} />}
        <select
          className="input w-auto py-1 text-sm"
          value={style}
          aria-label="All-over pattern"
          onChange={(e) => patch((s) => ({ ...s, pattern: { ...s.pattern, style: e.target.value as PatternStyle } }))}
        >
          {PATTERN_STYLES.filter((p) => p !== "artwork" || spec.pattern.artworkUrl).map((p) => (
            <option key={p} value={p}>
              {PATTERN_LABELS[p]}
            </option>
          ))}
        </select>
        {multi && (
          <span className="flex items-center gap-1">
            <span className="text-xs text-muted">{style === "gradient" ? "Top to bottom" : "Colors"}</span>
            {cols.map((c, i) => (
              <span key={i} className="flex items-center">
                <Swatches spec={spec} value={c} onChange={(v) => setCols(cols.map((x, j) => (j === i ? v : x)))} />
                {cols.length > 2 && (
                  <button type="button" className="ml-0.5 text-xs text-muted" aria-label="Remove color" onClick={() => setCols(cols.filter((_, j) => j !== i))}>
                    ×
                  </button>
                )}
              </span>
            ))}
            {cols.length < 5 && (
              <button type="button" className="rounded-full border border-dashed border-line px-2 text-xs text-muted" onClick={() => setCols([...cols, cols.includes("accent") ? "text" : "accent"])}>
                + color
              </button>
            )}
          </span>
        )}
        <CollarPick spec={spec} patch={patch} />
      </>
    );
  } else if (selected === "collar") {
    title = "Collar";
    controls = <CollarPick spec={spec} patch={patch} />;
  } else if (selected === "wordmark") {
    title = "Team name";
    const w = spec.wordmark;
    controls = (
      <>
        <input
          className="input w-40 py-1 text-sm"
          value={w.text}
          maxLength={30}
          aria-label="Team name text"
          onChange={(e) => patch((s) => ({ ...s, teamName: e.target.value, wordmark: { ...s.wordmark, text: e.target.value, show: e.target.value.trim() !== "" } }))}
        />
        <FontPick value={w.font} onChange={(font) => patch((s) => ({ ...s, wordmark: { ...s.wordmark, font }, brand: s.brand ? { ...s.brand, fonts: { ...s.brand.fonts, wordmark: font } } : s.brand }))} />
        <select className="input w-auto py-1 text-sm" value={w.style} aria-label="Shape" onChange={(e) => patch((s) => ({ ...s, wordmark: { ...s.wordmark, style: e.target.value as typeof w.style } }))}>
          <option value="arch">Arched</option>
          <option value="straight">Straight</option>
          <option value="diagonal">Rising</option>
        </select>
        <Swatches spec={spec} label="Letters" value="text" onChange={(c) => patch((s) => ({ ...s, colors: { ...s.colors, text: resolveColor(s, c) } }))} />
        <Swatches spec={spec} label="Outline" value="outline" onChange={(c) => patch((s) => ({ ...s, colors: { ...s.colors, outline: resolveColor(s, c) } }))} />
        <Btn onClick={() => patch((s) => ({ ...s, wordmark: { ...s.wordmark, scale: 1, offsetX: 0, offsetY: 0 } }))}>Reset spot</Btn>
        <Btn onClick={() => { patch((s) => ({ ...s, wordmark: { ...s.wordmark, show: false } })); onDeselect(); }}>Hide</Btn>
      </>
    );
  } else if (selected === "number" || selected === "name") {
    const isNum = selected === "number";
    title = isNum ? "Player number" : "Player name";
    const L = spec.lettering;
    controls = (
      <>
        <input
          className={`input py-1 text-sm ${isNum ? "w-16" : "w-36"}`}
          value={isNum ? spec.sample.number : spec.sample.name}
          maxLength={isNum ? 3 : 16}
          inputMode={isNum ? "numeric" : undefined}
          aria-label={title}
          onChange={(e) =>
            patch((s) => ({ ...s, sample: { ...s.sample, ...(isNum ? { number: e.target.value.replace(/\D/g, "") } : { name: e.target.value.toUpperCase() }) } }))
          }
        />
        <FontPick
          value={isNum ? L.numberFont : L.nameFont}
          onChange={(font) =>
            patch((s) => ({
              ...s,
              lettering: { ...s.lettering, [isNum ? "numberFont" : "nameFont"]: font },
              brand: s.brand ? { ...s.brand, fonts: { ...s.brand.fonts, [isNum ? "number" : "name"]: font } } : s.brand,
            }))
          }
        />
        <Swatches spec={spec} label="Fill" value="text" onChange={(c) => patch((s) => ({ ...s, colors: { ...s.colors, text: resolveColor(s, c) } }))} />
        <Swatches spec={spec} label="Outline" value="outline" onChange={(c) => patch((s) => ({ ...s, colors: { ...s.colors, outline: resolveColor(s, c) } }))} />
        {isNum && (
          <span className="flex gap-1">
            <Toggle on={L.numberFront} onClick={() => patch((s) => ({ ...s, lettering: { ...s.lettering, numberFront: !s.lettering.numberFront } }))}>Front</Toggle>
            <Toggle on={L.numberBack} onClick={() => patch((s) => ({ ...s, lettering: { ...s.lettering, numberBack: !s.lettering.numberBack } }))}>Back</Toggle>
            <Toggle on={L.numberSleeves} onClick={() => patch((s) => ({ ...s, lettering: { ...s.lettering, numberSleeves: !s.lettering.numberSleeves } }))}>Sleeves</Toggle>
          </span>
        )}
        <Btn
          onClick={() =>
            patch((s) => ({
              ...s,
              lettering: isNum ? { ...s.lettering, numberScale: 1, numberOffsetX: 0, numberOffsetY: 0 } : { ...s.lettering, nameScale: 1, nameOffsetX: 0, nameOffsetY: 0 },
            }))
          }
        >
          Reset spot
        </Btn>
        {!isNum && <Btn onClick={() => { patch((s) => ({ ...s, lettering: { ...s.lettering, showName: false } })); onDeselect(); }}>Hide</Btn>}
      </>
    );
  } else if (selected === "logo") {
    title = "Logo";
    controls = (
      <>
        <select
          className="input w-auto py-1 text-sm"
          value={spec.logo.position ?? "auto"}
          aria-label="Logo spot"
          onChange={(e) => patch((s) => ({ ...s, logo: { ...s.logo, position: e.target.value as LogoPosition, offsetX: 0, offsetY: 0 } }))}
        >
          {LOGO_POSITIONS.map((p) => (
            <option key={p} value={p}>
              {LOGO_POSITION_LABELS[p]}
            </option>
          ))}
        </select>
        <Btn onClick={() => patch((s) => ({ ...s, logo: { ...s.logo, scale: 1, offsetX: 0, offsetY: 0 } }))}>Reset spot</Btn>
        <Btn onClick={onOpenLogos}>Edit or replace…</Btn>
      </>
    );
  } else if (selected.startsWith("patch:")) {
    const kind = selected === "patch:alternate" ? "alternate" : "captain";
    title = kind === "alternate" ? "Shoulder patch" : "Captain letter";
    const p = spec.patches[kind];
    controls = (
      <>
        <select
          className="input w-auto py-1 text-sm"
          value={p.position}
          aria-label="Patch spot"
          onChange={(e) => patch((s) => ({ ...s, patches: { ...s.patches, [kind]: { ...s.patches[kind], position: e.target.value as PatchPosition } } }))}
        >
          {PATCH_POSITIONS.map((x) => (
            <option key={x} value={x}>
              {PATCH_POSITION_LABELS[x]}
            </option>
          ))}
        </select>
        {kind === "captain" && (
          <span className="flex gap-1">
            {(["C", "A"] as const).map((l) => (
              <Toggle key={l} on={spec.patches.captain.letter === l} onClick={() => patch((s) => ({ ...s, patches: { ...s.patches, captain: { ...s.patches.captain, letter: l } } }))}>
                {l}
              </Toggle>
            ))}
          </span>
        )}
        <Btn
          onClick={() => {
            patch((s) => ({ ...s, patches: { ...s.patches, [kind]: kind === "alternate" ? { ...s.patches.alternate, show: false } : { ...s.patches.captain, letter: "none" } } }));
            onDeselect();
          }}
        >
          Remove
        </Btn>
      </>
    );
  } else if (selected.startsWith("g:")) {
    const id = selected.slice(2);
    const g = allGraphics(spec).find((x) => x.id === id);
    if (!g) return null;
    title = GRAPHIC_LABELS[g.kind];
    const set = (fn: (g: Graphic) => Graphic) => editGraphic(id, fn);
    const common = (
      <Btn
        onClick={() => {
          editGraphic(id, () => null);
          onDeselect();
        }}
      >
        Delete
      </Btn>
    );
    if (g.kind === "panel") {
      controls = (
        <>
          <Swatches spec={spec} label="Fill" value={g.color} onChange={(c) => set((x) => ({ ...x, color: c }) as Graphic)} />
          <select className="input w-auto py-1 text-sm" value={g.edge} aria-label="Edge shape" onChange={(e) => set((x) => ({ ...x, edge: e.target.value as typeof g.edge, depth: x.kind === "panel" && !x.depth && e.target.value !== "straight" ? 0.15 : (x as typeof g).depth }) as Graphic)}>
            {PANEL_EDGES.filter((e) => e !== "custom" || g.edge === "custom").map((e) => (
              <option key={e} value={e}>
                {EDGE_LABELS[e]}
              </option>
            ))}
          </select>
          <TrimEditor spec={spec} trim={g.trim} onChange={(trim) => set((x) => ({ ...x, trim }) as Graphic)} />
          <span className="flex gap-1">
            <Toggle on={g.back !== "none"} onClick={() => set((x) => ({ ...x, back: g.back === "none" ? "straight" : "none" }) as Graphic)}>Back</Toggle>
            <Toggle on={g.sleeves} onClick={() => set((x) => ({ ...x, sleeves: !g.sleeves }) as Graphic)}>Sleeves</Toggle>
          </span>
          {common}
        </>
      );
    } else if (g.kind === "stripes") {
      controls = (
        <>
          <span className="flex items-center gap-1">
            <span className="text-xs text-muted">Bands</span>
            {g.bands.map((b, i) => (
              <span key={i} className="flex items-center">
                <Swatches spec={spec} value={b.color} onChange={(c) => set((x) => ({ ...x, bands: g.bands.map((y, j) => (j === i ? { ...y, color: c } : y)) }) as Graphic)} />
                {g.bands.length > 1 && (
                  <button type="button" className="ml-0.5 text-xs text-muted" aria-label="Remove band" onClick={() => set((x) => ({ ...x, bands: g.bands.filter((_, j) => j !== i) }) as Graphic)}>
                    ×
                  </button>
                )}
              </span>
            ))}
            {g.bands.length < 6 && (
              <button
                type="button"
                className="rounded-full border border-dashed border-line px-2 text-xs text-muted"
                onClick={() => set((x) => ({ ...x, bands: [...g.bands.map((b, i) => (i === g.bands.length - 1 ? { ...b, gap: b.gap || 0.01 } : b)), { color: "accent", width: g.bands[0].width * 0.6, gap: 0 }] }) as Graphic)}
              >
                + band
              </button>
            )}
          </span>
          {common}
        </>
      );
    } else if (g.kind === "yoke") {
      controls = (
        <>
          <Swatches spec={spec} label="Color" value={g.color} onChange={(c) => set((x) => ({ ...x, color: c }) as Graphic)} />
          {/* jerseys with a separate shoulder piece color the whole piece, so the edge shape only applies to the others */}
          {!hasYokePiece(spec.product) && (
            <select className="input w-auto py-1 text-sm" value={g.shape} aria-label="Bottom edge" onChange={(e) => set((x) => ({ ...x, shape: e.target.value as typeof g.shape }) as Graphic)}>
              <option value="straight">Straight edge</option>
              <option value="curved">Curved edge</option>
              <option value="pointed">Pointed edge</option>
            </select>
          )}
          <TrimEditor spec={spec} trim={g.trim} onChange={(trim) => set((x) => ({ ...x, trim }) as Graphic)} />
          {common}
        </>
      );
    } else {
      controls = (
        <>
          <Swatches spec={spec} label="Color" value={g.color} onChange={(c) => set((x) => ({ ...x, color: c }) as Graphic)} />
          <TrimEditor spec={spec} trim={g.trim} onChange={(trim) => set((x) => ({ ...x, trim }) as Graphic)} />
          <Toggle on={g.back} onClick={() => set((x) => ({ ...x, back: !g.back }) as Graphic)}>Back</Toggle>
          {common}
        </>
      );
    }
  }
  if (!controls) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-volt/40 bg-ink/90 px-3 py-2">
      <span className="text-sm font-semibold text-volt">{title}</span>
      {controls}
      <button type="button" className="ml-auto text-xs text-muted underline" onClick={onDeselect}>
        Done
      </button>
    </div>
  );
}

// "+ Add" menu: put a new part on the jersey and select it.
export function AddMenu({ spec, patch, onSelect, onOpenLogos }: { spec: DesignSpec; patch: Patch; onSelect: (id: string) => void; onOpenLogos: () => void }) {
  const [open, setOpen] = useState(false);
  const addGraphic = (make: (id: string) => Graphic) => {
    const id = newGraphicId(spec, make("x").kind);
    patch((s0) => {
      const s = materialize(s0);
      const g = make(id);
      // yokes and panels go under stripes
      const graphics = g.kind === "stripes" || g.kind === "sash" ? [...s.graphics, g] : [g, ...s.graphics];
      return { ...s, graphics };
    });
    onSelect(`g:${id}`);
    setOpen(false);
  };
  const items: [string, () => void][] = [
    ["Team name", () => { patch((s) => ({ ...s, wordmark: { ...s.wordmark, show: true, text: s.wordmark.text || s.teamName.toUpperCase() || "TEAM" } })); onSelect("wordmark"); setOpen(false); }],
    ["Player name", () => { patch((s) => ({ ...s, lettering: { ...s.lettering, showName: true }, sample: { ...s.sample, name: s.sample.name || "PLAYER" } })); onSelect("name"); setOpen(false); }],
    ["Logo", () => { onOpenLogos(); setOpen(false); }],
    ["Hem stripes", () => addGraphic((id) => ({ id, kind: "stripes", hidden: false, area: "body", y: 0.78, front: true, back: true, bands: [{ color: "secondary", width: 0.035, gap: 0.008 }, { color: "accent", width: 0.018, gap: 0.008 }, { color: "secondary", width: 0.035, gap: 0 }] }))],
    ["Sleeve stripes", () => addGraphic((id) => ({ id, kind: "stripes", hidden: false, area: "sleeves", y: 0.64, front: true, back: true, bands: [{ color: "secondary", width: 0.05, gap: 0.012 }, { color: "accent", width: 0.025, gap: 0 }] }))],
    ["Chest band", () => addGraphic((id) => ({ id, kind: "stripes", hidden: false, area: "body", y: 0.34, front: true, back: true, bands: [{ color: "accent", width: 0.012, gap: 0.006 }, { color: "secondary", width: 0.09, gap: 0.006 }, { color: "accent", width: 0.012, gap: 0 }] }))],
    ["Chevron split", () => addGraphic((id) => ({ id, kind: "panel", hidden: false, edge: "chevron", side: "below", y: 0.45, depth: -0.14, points: [], color: "secondary", trim: [{ color: "text", width: 0.014 }, { color: "accent", width: 0.014 }], front: true, back: "straight", sleeves: true, sleeveY: 0.62 }))],
    ["Star cut", () => addGraphic((id) => ({ id, kind: "panel", hidden: false, edge: "star_point", side: "below", y: 0.5, depth: 0.24, points: [], color: "secondary", trim: [{ color: "accent", width: 0.022 }, { color: "text", width: 0.012 }], front: true, back: "straight", sleeves: true, sleeveY: 0.6 }))],
    ["Diagonal split", () => addGraphic((id) => ({ id, kind: "panel", hidden: false, edge: "diagonal", side: "below", y: 0.55, depth: 0.3, points: [], color: "secondary", trim: [{ color: "accent", width: 0.016 }], front: true, back: "same", sleeves: false, sleeveY: 0.62 }))],
    ["Shoulders", () => addGraphic((id) => ({ id, kind: "yoke", hidden: false, color: "secondary", depth: 0.16, shape: "straight", trim: [{ color: "accent", width: 0.012 }], sleeves: true }))],
    ["Sash", () => addGraphic((id) => ({ id, kind: "sash", hidden: false, from: 0.12, to: 0.82, width: 0.14, color: "secondary", trim: [{ color: "accent", width: 0.012 }], back: true }))],
    ["Side panels", () => addGraphic((id) => ({ id, kind: "side_panels", hidden: false, width: 0.12, top: 0.18, taper: 0.3, color: "secondary", trim: [{ color: "accent", width: 0.012 }], back: true }))],
    ["Captain C", () => { patch((s) => ({ ...s, patches: { ...s.patches, captain: { ...s.patches.captain, letter: "C" } } })); onSelect("patch:captain"); setOpen(false); }],
  ];
  return (
    <span className="relative">
      <button type="button" className="btn-ghost px-3 py-1 text-sm" onClick={() => setOpen(!open)} aria-expanded={open}>
        + Add
      </button>
      {open && (
        <span className="absolute left-0 top-10 z-30 grid w-48 gap-0.5 rounded-lg border border-line bg-panel p-1 shadow-xl">
          {items.map(([label, fn]) => (
            <button key={label} type="button" className="rounded px-3 py-1.5 text-left text-sm hover:bg-ink" onClick={fn}>
              {label}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}
