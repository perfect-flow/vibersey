"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LOGO_POSITIONS, PRODUCTS, SPORTS, STANDARDS, productByKey, type LogoPosition, type ProductKey, type Sport } from "@/lib/catalog";

const LOGO_POSITION_LABELS: Record<LogoPosition, string> = {
  auto: "Standard spot",
  above_name: "Above team name",
  center_chest: "Center chest (big)",
  left_chest: "Left chest",
  right_chest: "Right chest",
  sleeves: "Sleeves",
  upper_back: "Upper back",
};
import { FONTS, defaultSpec, type DesignSpec, type FontKey } from "@/lib/design-spec";
import { fmt } from "@/lib/pricing";
import { JerseyPreview } from "./JerseyPreview";
import { SignupModal } from "./AuthForm";

type Msg = { role: "user" | "assistant"; content: string };
type Usage = { used: number; limit: number | null; allowed: boolean };
type CatalogProduct = {
  key: ProductKey;
  label: string;
  audience: "adult" | "youth";
  sizes: { size: string; price: number }[];
  fromPrice: number | null;
};

const SPORT_EMOJI: Record<Sport, string> = { baseball: "⚾", basketball: "🏀", football: "🏈", hockey: "🏒", soccer: "⚽" };

const STARTERS = [
  "Navy and gold, aggressive eagle logo, classic varsity numbers",
  "Retro 90s vibe with bold geometric shapes in teal and purple",
  "Black and red with a subtle flame pattern, team name Inferno",
  "Clean white with forest green pinstripes, script wordmark",
];

async function api<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export function Designer({ initialDesignId }: { initialDesignId?: string }) {
  const router = useRouter();
  const [designId, setDesignId] = useState<string | null>(initialDesignId ?? null);
  const [spec, setSpec] = useState<DesignSpec | null>(null);
  const [title, setTitle] = useState("Untitled jersey");
  const [locked, setLocked] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [user, setUser] = useState<{ email: string | null } | null>(null);
  const [view, setView] = useState<"front" | "back">("front");
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [signup, setSignup] = useState<string | null>(null);
  const [inspiration, setInspiration] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [size, setSize] = useState("");
  const [qty, setQty] = useState(1);
  const chatEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<{ user: { email: string | null } | null; usage: Usage }>("/api/me").then(({ data }) => {
      setUser(data.user);
      setUsage(data.usage);
    });
    api<{ products: CatalogProduct[] }>("/api/products").then(({ data }) => setCatalog(data.products ?? []));
  }, []);

  useEffect(() => {
    if (!initialDesignId) return;
    api<{ design: { spec: DesignSpec; title: string; locked: boolean }; messages: Msg[] }>(`/api/design/${initialDesignId}`).then(
      ({ ok, data }) => {
        if (!ok) return setNotice("We couldn't find that design.");
        setSpec(data.design.spec);
        setTitle(data.design.title);
        setLocked(data.design.locked);
        setMessages(data.messages);
      }
    );
  }, [initialDesignId]);

  // Braces matter: newer browsers return a Promise from scrollIntoView, and React
  // treats any returned value as a cleanup function, which crashes the page.
  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  // Save manual tweaks (debounced). These don't use up free generations.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const patchSpec = useCallback(
    (fn: (s: DesignSpec) => DesignSpec) => {
      setSpec((prev) => {
        if (!prev || locked) return prev;
        const next = fn(structuredClone(prev));
        if (designId) {
          if (saveTimer.current) clearTimeout(saveTimer.current);
          saveTimer.current = setTimeout(() => {
            api(`/api/design/${designId}`, { method: "PATCH", body: JSON.stringify({ spec: next }) });
          }, 600);
        }
        return next;
      });
    },
    [designId, locked]
  );

  async function ensureDesign(): Promise<string | null> {
    if (designId) return designId;
    if (!spec) return null;
    const { ok, data } = await api<{ design: { id: string } }>("/api/designs", {
      method: "POST",
      body: JSON.stringify({ sport: spec.sport, product: spec.product, spec }),
    });
    if (!ok) return null;
    setDesignId(data.design.id);
    window.history.replaceState(null, "", `/design/${data.design.id}`);
    return data.design.id;
  }

  function pickProduct(key: ProductKey) {
    const def = productByKey(key)!;
    setSpec(defaultSpec(def.sport, key));
    setMessages([
      {
        role: "assistant",
        content: `Let's design your ${STANDARDS[def.sport].label.toLowerCase()} jersey! Tell me your team name, colors, and any inspiration. You can also upload a logo or ask me to create one.`,
      },
    ]);
  }

  async function send(text: string) {
    if (!spec || !text.trim() || busy) return;
    if (locked) return setNotice("This is a locked team template. Duplicate it from My designs to keep designing.");
    setMessages((m) => [...m, { role: "user", content: text }]);
    setInput("");
    setBusy(true);
    setNotice(null);
    const { ok, status, data } = await api<{
      designId: string;
      spec: DesignSpec;
      reply: string;
      title: string;
      usage: Usage;
      error?: string;
    }>("/api/design/chat", {
      method: "POST",
      body: JSON.stringify({
        designId,
        sport: spec.sport,
        product: spec.product,
        spec: designId ? undefined : spec,
        message: text,
        inspirationImage: inspiration,
      }),
    });
    setBusy(false);
    if (data.usage) setUsage(data.usage);
    if (status === 402) {
      setMessages((m) => m.slice(0, -1));
      setInput(text);
      setSignup("You've used your 5 free designs. Create a free account to keep designing, save your jerseys, and order.");
      return;
    }
    if (data.designId && !designId) {
      setDesignId(data.designId);
      window.history.replaceState(null, "", `/design/${data.designId}`);
    }
    if (!ok) {
      setMessages((m) => [...m, { role: "assistant", content: data.error ?? "Something went wrong. Please try again." }]);
      return;
    }
    setInspiration(null);
    setSpec(data.spec);
    setTitle(data.title);
    setMessages((m) => [...m, { role: "assistant", content: data.reply }]);
  }

  async function upload(file: File, kind: "logo" | "inspiration") {
    const form = new FormData();
    form.append("file", file);
    form.append("kind", kind);
    setNotice(kind === "logo" ? "Uploading logo…" : "Uploading image…");
    const res = await fetch("/api/upload", { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) return setNotice(data.error ?? "Upload failed");
    setNotice(null);
    if (kind === "logo") {
      await ensureDesign();
      patchSpec((s) => ({ ...s, logo: { ...s.logo, url: data.url, source: "upload", prompt: null } }));
    } else setInspiration(data.url);
  }

  async function save() {
    if (!user) return setSignup("Create a free account to save your designs and come back to them anytime.");
    const id = await ensureDesign();
    if (!id) return;
    await api(`/api/design/${id}`, { method: "PATCH", body: JSON.stringify({ save: true, title, spec: locked ? undefined : spec }) });
    setNotice("Saved to My designs.");
  }

  async function makeTeam() {
    if (!user) return setSignup("Create a free account to build a team template and collect your roster.");
    const id = await ensureDesign();
    if (!id) return;
    const { ok, data } = await api<{ team: { id: string }; error?: string }>("/api/teams", {
      method: "POST",
      body: JSON.stringify({ designId: id, name: spec?.wordmark.text || title }),
    });
    if (!ok) return setNotice(data.error ?? "Couldn't create the team.");
    router.push(`/teams/${data.team.id}`);
  }

  async function buy() {
    const id = await ensureDesign();
    if (!id || !spec || !size) return setNotice("Pick a size first.");
    setBusy(true);
    const { ok, data } = await api<{ url: string; error?: string }>("/api/checkout", {
      method: "POST",
      body: JSON.stringify({
        mode: "design",
        designId: id,
        lines: [{ size, name: spec.sample.name, number: spec.sample.number, quantity: qty }],
      }),
    });
    setBusy(false);
    if (!ok) return setNotice(data.error ?? "Checkout failed.");
    window.location.href = data.url;
  }

  // ---- Step 1: pick a jersey -------------------------------------------------
  if (!spec) {
    if (initialDesignId && !notice) return <div className="p-10 text-center text-muted">Loading design…</div>;
    return (
      <section className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="font-display text-6xl leading-none tracking-wide md:text-8xl">
          Design your jersey <span className="text-volt">with AI</span>
        </h1>
        <p className="mt-3 max-w-2xl text-lg text-muted">
          Pick a jersey, chat with our AI designer, and we&apos;ll print and ship it. One player or the whole team.
        </p>
        {notice && <p className="mt-4 text-red-400">{notice}</p>}
        <div className="mt-8 space-y-6">
          {SPORTS.map((sport) => (
            <div key={sport}>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted">
                {SPORT_EMOJI[sport]} {STANDARDS[sport].label}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {PRODUCTS.filter((p) => p.sport === sport && p.audience === "adult").map((p) => {
                  const c = catalog.find((x) => x.key === p.key);
                  const youth = p.youthKey ? productByKey(p.youthKey) : undefined;
                  return (
                    <button
                      key={p.key}
                      onClick={() => pickProduct(p.key)}
                      className="card flex items-center gap-4 p-4 text-left transition hover:border-volt"
                    >
                      <JerseyPreview spec={defaultSpec(sport, p.key)} player={{ name: "", number: "" }} view="front" className="h-20 w-20 shrink-0" />
                      <div>
                        <div className="font-semibold">{p.label}</div>
                        <div className="text-sm text-muted">
                          {c?.fromPrice ? `From ${fmt(c.fromPrice)}` : "All-over print"}
                          {youth ? " · youth sizes too" : ""}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  // ---- Step 2: design --------------------------------------------------------
  const product = productByKey(spec.product)!;
  const sizes = [
    ...(catalog.find((c) => c.key === spec.product)?.sizes ?? []),
    ...(product.youthKey ? catalog.find((c) => c.key === product.youthKey)?.sizes ?? [] : []),
  ];
  const price = sizes.find((s) => s.size === size)?.price;
  const freeLeft = usage?.limit != null ? Math.max(0, usage.limit - usage.used) : null;
  const player = spec.sample;

  return (
    <section className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[1fr_420px]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="bg-transparent font-display text-4xl tracking-wide outline-none"
            />
            <div className="text-sm text-muted">
              {product.label}
              {locked && " · locked team template"}
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={() => setView(view === "front" ? "back" : "front")}>
              Show {view === "front" ? "back" : "front"}
            </button>
            <button className="btn-ghost" onClick={save}>
              Save
            </button>
            <button className="btn-ghost" onClick={makeTeam}>
              Team template
            </button>
          </div>
        </div>

        <div className="card grid place-items-center bg-gradient-to-b from-panel to-ink p-4">
          <JerseyPreview spec={spec} player={player} view={view} className="h-[460px] w-full max-w-[520px]" />
          <div className="flex gap-2 text-xs text-muted">
            <button className={view === "front" ? "text-volt" : ""} onClick={() => setView("front")}>Front</button>·
            <button className={view === "back" ? "text-volt" : ""} onClick={() => setView("back")}>Back</button>
          </div>
        </div>

        {notice && <p className="text-sm text-volt">{notice}</p>}

        {/* manual controls */}
        <div className="card grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <span className="label">Player name</span>
            <input
              className="input"
              value={spec.sample.name}
              maxLength={16}
              onChange={(e) => patchSpec((s) => ({ ...s, sample: { ...s.sample, name: e.target.value.toUpperCase() }, lettering: { ...s.lettering, showName: s.lettering.showName || e.target.value.trim() !== "" } }))}
            />
          </div>
          <div>
            <span className="label">Number</span>
            <input
              className="input"
              value={spec.sample.number}
              maxLength={3}
              inputMode="numeric"
              onChange={(e) => patchSpec((s) => ({ ...s, sample: { ...s.sample, number: e.target.value.replace(/\D/g, "") } }))}
            />
          </div>
          <div>
            <span className="label">Team name on chest</span>
            <input
              className="input"
              value={spec.wordmark.text}
              maxLength={30}
              onChange={(e) => patchSpec((s) => ({ ...s, teamName: e.target.value, wordmark: { ...s.wordmark, text: e.target.value, show: e.target.value.trim() !== "" } }))}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={spec.lettering.showName}
              onChange={(e) => patchSpec((s) => ({ ...s, lettering: { ...s.lettering, showName: e.target.checked } }))}
            />
            Player name on back
          </label>
          <div>
            <span className="label">Team name font</span>
            <select
              className="input"
              value={spec.wordmark.font}
              onChange={(e) => patchSpec((s) => ({ ...s, wordmark: { ...s.wordmark, font: e.target.value as FontKey } }))}
            >
              {Object.entries(FONTS).map(([k, f]) => (
                <option key={k} value={k}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <span className="label">Colors</span>
            <div className="flex flex-wrap gap-3">
              {(["primary", "secondary", "accent", "text", "outline"] as const).map((k) => (
                <label key={k} className="flex items-center gap-2 text-xs capitalize text-muted">
                  <input
                    type="color"
                    value={spec.colors[k]}
                    onChange={(e) => patchSpec((s) => ({ ...s, colors: { ...s.colors, [k]: e.target.value.toUpperCase() } }))}
                    className="h-8 w-8 cursor-pointer rounded border border-line bg-transparent"
                  />
                  {k === "text" ? "letters" : k}
                </label>
              ))}
            </div>
          </div>
          {(
            [
              ["Number font", "numberFont"],
              ["Name font", "nameFont"],
            ] as const
          ).map(([label, key]) => (
            <div key={key}>
              <span className="label">{label}</span>
              <select
                className="input"
                value={spec.lettering[key]}
                onChange={(e) => patchSpec((s) => ({ ...s, lettering: { ...s.lettering, [key]: e.target.value as FontKey } }))}
              >
                {Object.entries(FONTS).map(([k, f]) => (
                  <option key={k} value={k}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
          ))}
          {spec.logo.url && (
            <>
              <div>
                <span className="label">Logo position</span>
                <select
                  className="input"
                  value={spec.logo.position ?? "auto"}
                  onChange={(e) => patchSpec((s) => ({ ...s, logo: { ...s.logo, position: e.target.value as LogoPosition } }))}
                >
                  {LOGO_POSITIONS.filter((p) => p !== "sleeves" || product.placements.includes("sleeve_left")).map((p) => (
                    <option key={p} value={p}>
                      {LOGO_POSITION_LABELS[p]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <span className="label">Logo size</span>
                <input
                  type="range"
                  min={0.5}
                  max={3}
                  step={0.1}
                  value={spec.logo.scale ?? 1}
                  onChange={(e) => patchSpec((s) => ({ ...s, logo: { ...s.logo, scale: Number(e.target.value) } }))}
                  className="mt-3 w-full accent-[var(--color-volt)]"
                />
              </div>
            </>
          )}
          <div>
            <span className="label">Logo</span>
            <label className="btn-ghost w-full cursor-pointer">
              {spec.logo.url ? "Replace logo" : "Upload logo"}
              <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], "logo")} />
            </label>
          </div>
        </div>
      </div>

      {/* chat + checkout */}
      <aside className="flex flex-col gap-4 lg:sticky lg:top-20 lg:h-[calc(100vh-6rem)]">
        <div className="card flex min-h-[420px] flex-1 flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="font-semibold">AI designer</span>
            {freeLeft != null && (
              <span className="text-xs text-muted">
                {freeLeft} of {usage?.limit} free designs left
              </span>
            )}
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "ml-8 rounded-xl bg-volt px-3 py-2 text-sm text-ink" : "mr-8 rounded-xl bg-ink px-3 py-2 text-sm"}>
                {m.content}
              </div>
            ))}
            {busy && <div className="mr-8 animate-pulse rounded-xl bg-ink px-3 py-2 text-sm text-muted">Designing…</div>}
            {messages.length <= 1 && !busy && (
              <div className="space-y-2 pt-2">
                {STARTERS.map((s) => (
                  <button key={s} onClick={() => send(s)} className="block w-full rounded-lg border border-line px-3 py-2 text-left text-xs text-muted hover:border-volt hover:text-white">
                    {s}
                  </button>
                ))}
              </div>
            )}
            <div ref={chatEnd} />
          </div>
          <form
            className="border-t border-line p-3"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            {inspiration && (
              <div className="mb-2 flex items-center gap-2 text-xs text-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={inspiration} alt="" className="h-10 w-10 rounded object-cover" /> Inspiration attached
                <button type="button" onClick={() => setInspiration(null)} className="underline">
                  remove
                </button>
              </div>
            )}
            <div className="flex gap-2">
              <label className="btn-ghost cursor-pointer px-3" title="Attach an inspiration image">
                📎
                <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], "inspiration")} />
              </label>
              <input
                className="input"
                placeholder={locked ? "Team templates are locked" : "Describe colors, logo, vibe…"}
                value={input}
                disabled={locked}
                onChange={(e) => setInput(e.target.value)}
              />
              <button className="btn-primary" disabled={busy || !input.trim() || locked}>
                Send
              </button>
            </div>
          </form>
        </div>

        <div className="card space-y-3 p-4">
          <div className="flex items-end justify-between">
            <span className="font-semibold">Buy this jersey</span>
            <span className="font-display text-3xl text-volt">{price ? fmt(price * qty) : sizes.length ? "" : "Coming soon"}</span>
          </div>
          <div className="flex gap-2">
            <select className="input" value={size} onChange={(e) => setSize(e.target.value)}>
              <option value="">Size</option>
              {sizes.map((s) => (
                <option key={s.size} value={s.size}>
                  {s.size} · {fmt(s.price)}
                </option>
              ))}
            </select>
            <input type="number" min={1} max={50} className="input w-20" value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value)))} />
          </div>
          <button className="btn-primary w-full" onClick={buy} disabled={busy || !size}>
            Checkout
          </button>
          <p className="text-xs text-muted">Printed with {spec.sample.name || "no name"} {spec.sample.number && `#${spec.sample.number}`}. Ordering for a team? Use Team template.</p>
        </div>
      </aside>

      <SignupModal open={!!signup} reason={signup ?? ""} onClose={() => setSignup(null)} next={designId ? `/design/${designId}` : "/"} />
    </section>
  );
}
