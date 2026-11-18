"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PRODUCTS, SPORTS, STANDARDS, productByKey, type Placement, type ProductKey, type Sport } from "@/lib/catalog";
import { defaultSpec, type DesignSpec } from "@/lib/design-spec";
import { fmt } from "@/lib/pricing";
import { prepareImage } from "@/lib/client-image";
import { JerseyPreview, type CanvasTransform } from "./JerseyPreview";
import { applyCanvasTransform } from "@/lib/canvas-edit";
import { materialize } from "@/lib/graphics";
import { AddMenu, ElementToolbar } from "./ElementToolbar";
import { SeamWarnings } from "./SeamWarnings";
import { ModelPreviewButton } from "./ModelPreview";
import { SignupModal } from "./AuthForm";
import { BrandBoard } from "./BrandBoard";
import { LogoBuilder } from "./LogoBuilder";
import { ProductDetailsModal } from "./ProductDetails";

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

// The chat opens by building the brand board, so later edits stay on-brand.
const BRAND_OPENER =
  "Let's get started with a brand board! Do you have specific colors or logos? Upload images with the 📎 or share a link for some inspiration to get started.";
const BRAND_STARTERS = [
  "Our colors are navy and gold. I'll upload our logo",
  "Pick bold, modern colors for me and design a logo",
  "Build a brand for the Riverside Hawks: red, black and silver",
  "Retro 90s vibe in teal and purple, aggressive mascot logo",
];

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

const DEFAULT_PRODUCT: ProductKey = "hockey-recycled";
const LAST_TYPE_KEY = "vibersey:lastType";

// The chat opens by building the brand board.
function greeting(): Msg {
  return { role: "assistant", content: BRAND_OPENER };
}

function isAdultProduct(key: string | undefined): key is ProductKey {
  const p = key ? productByKey(key) : undefined;
  return !!p && p.audience === "adult";
}

export function Designer({ initialDesignId, initialProduct }: { initialDesignId?: string; initialProduct?: string }) {
  const router = useRouter();
  const [designId, setDesignId] = useState<string | null>(initialDesignId ?? null);
  // A fresh visit to the home page opens the builder right away on a jersey type.
  const startKey: ProductKey | null = initialDesignId ? null : isAdultProduct(initialProduct) ? initialProduct : DEFAULT_PRODUCT;
  const [spec, setSpec] = useState<DesignSpec | null>(() => (startKey ? defaultSpec(productByKey(startKey)!.sport, startKey) : null));
  const [title, setTitle] = useState("Untitled jersey");
  const [locked, setLocked] = useState(false);
  const [messages, setMessages] = useState<Msg[]>(() => (startKey ? [greeting()] : []));
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [user, setUser] = useState<{ email: string | null } | null>(null);
  const [view, setView] = useState<"front" | "back">("front");
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [signup, setSignup] = useState<string | null>(null);
  // an image attached in chat: either the customer's logo (already placed on
  // the jersey) or inspiration for the AI
  const [attachment, setAttachment] = useState<{ url: string; file: File; asLogo: boolean; prevLogo: DesignSpec["logo"] | null } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [size, setSize] = useState("");
  const [qty, setQty] = useState(1);
  const [logosOpen, setLogosOpen] = useState(false);
  const chatEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<{ user: { email: string | null } | null; usage: Usage }>("/api/me").then(({ data }) => {
      setUser(data.user);
      setUsage(data.usage);
    });
    api<{ products: CatalogProduct[] }>("/api/products").then(({ data }) => setCatalog(data.products ?? []));
  }, []);

  // Reopen the home page on the jersey type picked last time (unless the link names one).
  useEffect(() => {
    if (initialDesignId || isAdultProduct(initialProduct)) return;
    let last: string | null = null;
    try {
      last = localStorage.getItem(LAST_TYPE_KEY);
    } catch {}
    if (isAdultProduct(last ?? undefined) && last !== DEFAULT_PRODUCT) pickProduct(last as ProductKey);
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  // Scroll only the chat list (not the whole page), so the builder on the home
  // page doesn't jump down to the chat when it first loads.
  useEffect(() => {
    const end = chatEnd.current;
    const list = end?.parentElement;
    if (list) list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  // Save manual tweaks (debounced). These don't use up free generations.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const designIdRef = useRef(designId);
  designIdRef.current = designId;
  const patchSpec = useCallback(
    (fn: (s: DesignSpec) => DesignSpec) => {
      setSpec((prev) => {
        if (!prev || locked) return prev;
        const next = fn(structuredClone(prev));
        // read the id from a ref: a design created moments ago (first chat or
        // upload) isn't in this callback's closure yet
        const id = designIdRef.current;
        if (id) {
          if (saveTimer.current) clearTimeout(saveTimer.current);
          saveTimer.current = setTimeout(() => {
            api(`/api/design/${id}`, { method: "PATCH", body: JSON.stringify({ spec: next }) });
          }, 600);
        }
        return next;
      });
    },
    [locked]
  );

  // Changes from the brand board and the logo builder. Saved like manual
  // tweaks; a design that doesn't exist yet is created first.
  const commit = (fn: (s: DesignSpec) => DesignSpec) => {
    if (!spec || locked) return;
    if (designIdRef.current) return patchSpec(fn);
    const next = fn(structuredClone(spec));
    setSpec(next);
    return ensureDesign(next).then(() => undefined);
  };
  // Canvas editing: the selected part, and dragging it. A drag previews live
  // from the design as it was when the drag began, and is saved once at the end.
  const [selected, setSelected] = useState<string | null>(null);
  const dragStart = useRef<DesignSpec | null>(null);
  const onCanvasTransform = (id: string, pl: Placement, t: CanvasTransform, phase: "move" | "end") => {
    if (!spec || locked) return;
    if (phase === "end") {
      dragStart.current = null;
      patchSpec((s) => s); // saves the dropped position
      return;
    }
    if (!dragStart.current) dragStart.current = spec;
    setSpec(applyCanvasTransform(dragStart.current, id, pl, t));
  };
  // Delete removes a selected stripe set or panel; Escape lets go
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "Escape") setSelected(null);
      if ((e.key === "Delete" || e.key === "Backspace") && selected?.startsWith("g:")) {
        const id = selected.slice(2);
        patchSpec((s) => {
          const m = materialize(s);
          return { ...m, graphics: m.graphics.filter((g) => g.id !== id) };
        });
        setSelected(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, patchSpec]);

  // Undo/redo. Every spec change is recorded; quick bursts (dragging a slider)
  // count as one step. Undoing saves the restored version right away.
  const undoStack = useRef<DesignSpec[]>([]);
  const redoStack = useRef<DesignSpec[]>([]);
  const lastSpec = useRef<DesignSpec | null>(null);
  const lastPush = useRef(0);
  const skipHistory = useRef(false);
  const [, setHistoryTick] = useState(0);
  useEffect(() => {
    if (!spec) return;
    const prev = lastSpec.current;
    lastSpec.current = spec;
    if (skipHistory.current || !prev || prev.product !== spec.product) {
      skipHistory.current = false;
      return;
    }
    if (JSON.stringify(prev) === JSON.stringify(spec)) return;
    const now = Date.now();
    if (now - lastPush.current > 800) {
      undoStack.current.push(prev);
      if (undoStack.current.length > 50) undoStack.current.shift();
    }
    lastPush.current = now;
    redoStack.current = [];
    setHistoryTick((t) => t + 1);
  }, [spec]);

  function travel(from: React.RefObject<DesignSpec[]>, to: React.RefObject<DesignSpec[]>) {
    const target = from.current.pop();
    if (!target || !spec || locked) return;
    to.current.push(spec);
    skipHistory.current = true;
    lastPush.current = 0;
    setSpec(target);
    setHistoryTick((t) => t + 1);
    const id = designIdRef.current;
    if (id) api(`/api/design/${id}`, { method: "PATCH", body: JSON.stringify({ spec: target }) });
  }
  const undo = () => travel(undoStack, redoStack);
  const redo = () => travel(redoStack, undoStack);

  async function ensureDesign(current: DesignSpec | null = spec): Promise<string | null> {
    if (designId) return designId;
    if (!current) return null;
    const { ok, data } = await api<{ design: { id: string } }>("/api/designs", {
      method: "POST",
      body: JSON.stringify({ sport: current.sport, product: current.product, spec: current }),
    });
    if (!ok) return null;
    designIdRef.current = data.design.id;
    setDesignId(data.design.id);
    window.history.replaceState(null, "", `/design/${data.design.id}`);
    return data.design.id;
  }

  // Switch jersey type. Before the design is saved, the switch happens in place and
  // keeps the colors, team name, logo and sample player. Once a design exists, a
  // different type starts a new jersey (the current one stays in My designs).
  function pickProduct(key: ProductKey) {
    try {
      localStorage.setItem(LAST_TYPE_KEY, key);
    } catch {}
    if (designIdRef.current) {
      window.location.href = `/?type=${key}`;
      return;
    }
    const def = productByKey(key)!;
    const fresh = defaultSpec(def.sport, key);
    setSpec((prev) => {
      if (!prev) return fresh;
      return {
        ...fresh,
        teamName: prev.teamName,
        colors: prev.colors,
        logo: { ...prev.logo, position: "auto", offsetX: 0, offsetY: 0 },
        wordmark: { ...fresh.wordmark, text: prev.wordmark.text, font: prev.wordmark.font },
        sample: prev.sample,
        // the brand board and patches carry over to the new jersey
        lettering: { ...fresh.lettering, numberFont: prev.lettering.numberFont, nameFont: prev.lettering.nameFont },
        patches: prev.patches,
        brand: prev.brand,
      };
    });
    setView("front");
    setSize("");
    setMessages((m) => (m.length <= 1 ? [greeting()] : m));
  }

  async function send(text: string) {
    if (!spec || !text.trim() || busy) return;
    if (uploading) return setNotice("Hang on, your image is still uploading.");
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
        spec,
        message: text,
        inspirationImage: attachment?.url ?? null,
        attachmentIsLogo: attachment?.asLogo ?? false,
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
      designIdRef.current = data.designId;
      setDesignId(data.designId);
      window.history.replaceState(null, "", `/design/${data.designId}`);
    }
    if (!ok) {
      setMessages((m) => [...m, { role: "assistant", content: data.error ?? "Something went wrong. Please try again." }]);
      return;
    }
    setAttachment(null);
    setSpec(data.spec);
    setTitle(data.title);
    setMessages((m) => [...m, { role: "assistant", content: data.reply }]);
  }

  // Shrink (keeping transparency) and upload one image. Returns its public URL.
  async function uploadImage(file: File, kind: "logo" | "inspiration"): Promise<string | null> {
    let body: FormData;
    try {
      const prepared = await prepareImage(file);
      body = new FormData();
      body.append("file", prepared.file, prepared.name);
      body.append("kind", kind);
    } catch (e) {
      setNotice((e as Error).message);
      return null;
    }
    let data: { url?: string; error?: string } = {};
    let ok = false;
    try {
      const res = await fetch("/api/upload", { method: "POST", body });
      ok = res.ok;
      data = await res.json().catch(() => ({}));
      if (res.status === 413) data.error = "That image is too large. Try one under 4 MB.";
    } catch {
      // network error, handled below
    }
    if (!ok || !data.url) {
      setNotice(data.error ?? "Upload failed. Please try again.");
      return null;
    }
    return data.url;
  }

  // Put a logo on the jersey and save right away (not debounced) so it
  // survives a refresh or an immediate chat message.
  async function applyLogo(logo: DesignSpec["logo"]) {
    if (!spec) return;
    // the jersey's main logo is the brand's main logo
    const main = logo.url && logo.source ? { url: logo.url, source: logo.source, prompt: logo.prompt } : null;
    const next: DesignSpec = { ...spec, logo, brand: spec.brand ? { ...spec.brand, logos: { ...spec.brand.logos, main } } : spec.brand };
    setSpec(next);
    const id = await ensureDesign(next);
    if (id) await api(`/api/design/${id}`, { method: "PATCH", body: JSON.stringify({ spec: next }) });
  }

  async function uploadLogo(file: File): Promise<string | null> {
    if (!spec) return null;
    if (locked) {
      setNotice("This is a locked team template. Duplicate it from My designs to keep designing.");
      return null;
    }
    setUploading(true);
    setNotice("Uploading logo…");
    const url = await uploadImage(file, "logo");
    if (url) {
      await applyLogo({ ...spec.logo, url, source: "upload", prompt: null });
      setNotice("Logo added. Click it on the jersey to move or resize it.");
    }
    setUploading(false);
    return url;
  }

  // The paperclip in chat. Logos (transparent images, or files named like a
  // logo) go straight onto the jersey; anything else is inspiration. The chip
  // lets the customer switch.
  async function attach(file: File) {
    if (!spec) return;
    if (locked) return setNotice("This is a locked team template. Duplicate it from My designs to keep designing.");
    const prevLogo = spec.logo;
    const prepared = await prepareImage(file).catch(() => null);
    const looksLikeLogo = !!prepared?.transparent || /logo|crest|badge|emblem/i.test(file.name);
    if (looksLikeLogo) {
      const url = await uploadLogo(file);
      if (url) setAttachment({ url, file, asLogo: true, prevLogo });
      return;
    }
    setUploading(true);
    setNotice("Uploading image…");
    const url = await uploadImage(file, "inspiration");
    setUploading(false);
    if (!url) return;
    setNotice(null);
    setAttachment({ url, file, asLogo: false, prevLogo });
  }

  async function switchAttachment(asLogo: boolean) {
    if (!attachment || !spec) return;
    if (asLogo) {
      const url = await uploadLogo(attachment.file); // re-upload with the background removed
      if (url) setAttachment({ ...attachment, url, asLogo: true, prevLogo: spec.logo });
    } else {
      if (attachment.prevLogo) await applyLogo(attachment.prevLogo);
      setNotice(null);
      setAttachment({ ...attachment, asLogo: false });
    }
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

  if (!spec) {
    if (!notice) return <div className="p-10 text-center text-muted">Loading design…</div>;
    return (
      <div className="p-10 text-center">
        <p className="text-red-400">{notice}</p>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/" className="btn-ghost mt-4 inline-block">
          Start a new jersey
        </a>
      </div>
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
    <section className="mx-auto grid max-w-[1600px] gap-6 px-4 py-6 lg:grid-cols-[1fr_400px] xl:grid-cols-[230px_1fr_400px]">
      <JerseyTypes current={spec.product} catalog={catalog} startsNew={!!designId} onPick={pickProduct} />

      <div className="min-w-0 space-y-4">
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
            <button className="btn-ghost" onClick={() => setLogosOpen(true)} disabled={locked}>
              Logos &amp; patches
            </button>
            <button className="btn-ghost" onClick={save}>
              Save
            </button>
            <button className="btn-ghost" onClick={makeTeam}>
              Team template
            </button>
          </div>
        </div>

        <div className="card relative grid gap-3 bg-gradient-to-b from-panel to-ink p-4">
          {!locked && (
            <div className="absolute inset-x-4 top-4 z-20">
              {selected ? (
                <ElementToolbar spec={spec} selected={selected} patch={patchSpec} onOpenLogos={() => setLogosOpen(true)} onDeselect={() => setSelected(null)} />
              ) : (
                <div className="flex items-center gap-3">
                  <AddMenu spec={spec} patch={patchSpec} onSelect={setSelected} onOpenLogos={() => setLogosOpen(true)} />
                  <span className="text-xs text-muted">Click any part of the jersey to edit it. Drag to move, pull a corner to resize.</span>
                </div>
              )}
            </div>
          )}
          <div className={`grid place-items-center ${locked ? "" : "pt-12"}`}>
            <JerseyPreview
              spec={spec}
              player={player}
              view={view}
              className="h-[520px] w-full max-w-[600px]"
              selected={selected}
              onSelect={locked ? undefined : (id) => setSelected(id)}
              onTransform={locked ? undefined : onCanvasTransform}
            />
          </div>
          {!locked && (
            <SeamWarnings
              spec={spec}
              player={player}
              onShow={(id, pl) => {
                if (pl === "front" || pl === "back") setView(pl);
                setSelected(id);
              }}
            />
          )}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <div className="flex overflow-hidden rounded-lg border border-line text-sm">
              <button className={`px-3 py-1 ${view === "front" ? "bg-volt text-ink" : "text-muted"}`} onClick={() => setView("front")}>Front</button>
              <button className={`px-3 py-1 ${view === "back" ? "bg-volt text-ink" : "text-muted"}`} onClick={() => setView("back")}>Back</button>
            </div>
            <button className="btn-ghost px-3 py-1 text-sm" onClick={undo} disabled={!undoStack.current.length || busy || locked} title="Undo the last change">
              ↶ Undo
            </button>
            <button className="btn-ghost px-3 py-1 text-sm" onClick={redo} disabled={!redoStack.current.length || busy || locked} title="Redo">
              ↷ Redo
            </button>
            <ModelPreviewButton className="btn-ghost px-3 py-1 text-sm" getDesignId={() => ensureDesign()} spec={spec} player={player} />
          </div>
        </div>

        {notice && <p className="text-sm text-volt">{notice}</p>}

        <BrandBoard spec={spec} locked={locked} commit={commit} onOpenLogos={() => setLogosOpen(true)} onNotice={setNotice} />

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
                {(spec.brand ? STARTERS : BRAND_STARTERS).map((s) => (
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
            {attachment && (
              <div className="mb-2 flex items-center gap-2 text-xs text-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={attachment.url}
                  alt=""
                  className="h-10 w-10 rounded object-contain"
                  style={{ background: "repeating-conic-gradient(#3a3a44 0% 25%, #23232b 0% 50%) 50% / 10px 10px" }}
                />
                <span>{attachment.asLogo ? "Added as your logo" : "Inspiration attached"}</span>
                <button type="button" disabled={uploading} onClick={() => switchAttachment(!attachment.asLogo)} className="underline">
                  {attachment.asLogo ? "use as inspiration instead" : "use as my logo"}
                </button>
                <button type="button" onClick={() => setAttachment(null)} className="ml-auto underline">
                  remove
                </button>
              </div>
            )}
            <div className="flex gap-2">
              <label
                className={`btn-ghost cursor-pointer px-3 ${uploading || busy ? "pointer-events-none opacity-50" : ""}`}
                title="Attach your logo or an inspiration image"
              >
                📎
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) attach(f);
                  }}
                />
              </label>
              <input
                className="input"
                placeholder={locked ? "Team templates are locked" : "Describe colors, logo, vibe…"}
                value={input}
                disabled={locked}
                onChange={(e) => setInput(e.target.value)}
              />
              <button className="btn-primary" disabled={busy || uploading || !input.trim() || locked}>
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

      {logosOpen && (
        <LogoBuilder
          spec={spec}
          locked={locked}
          commit={commit}
          upload={(f) => uploadImage(f, "logo")}
          onClose={() => setLogosOpen(false)}
          onSignup={(r) => {
            setLogosOpen(false);
            setSignup(r);
          }}
          onUsage={setUsage}
        />
      )}

      <SignupModal open={!!signup} reason={signup ?? ""} onClose={() => setSignup(null)} next={designId ? `/design/${designId}` : "/"} />
    </section>
  );
}

// Jersey type list: a column on the left on wide screens, a scrolling strip on
// smaller ones.
function JerseyTypes({
  current,
  catalog,
  startsNew,
  onPick,
}: {
  current: ProductKey;
  catalog: CatalogProduct[];
  startsNew: boolean;
  onPick: (key: ProductKey) => void;
}) {
  // In the phone/tablet strip, bring the selected type into view (sideways only,
  // so the page itself never scrolls).
  const strip = useRef<HTMLDivElement>(null);
  const [details, setDetails] = useState<ProductKey | null>(null);
  const shown = details ? productByKey(details) : undefined;
  const pricesOf = (k?: ProductKey) => (k ? catalog.find((x) => x.key === k)?.sizes ?? [] : []);
  useEffect(() => {
    const el = strip.current;
    const btn = el?.querySelector<HTMLElement>("[aria-current=true]");
    if (!el || !btn || el.scrollWidth <= el.clientWidth) return;
    el.scrollTo({ left: btn.offsetLeft - el.offsetLeft - 16, behavior: "smooth" });
  }, [current]);
  return (
    <nav aria-label="Jersey types" className="min-w-0 lg:col-span-2 xl:col-span-1 xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Jersey type</h2>
        {startsNew && <span className="text-xs text-muted">Picking one starts a new jersey</span>}
      </div>
      <div ref={strip} className="flex gap-2 overflow-x-auto pb-2 xl:flex-col xl:gap-4 xl:overflow-visible xl:pb-0">
        {SPORTS.map((sport) => {
          const items = PRODUCTS.filter((p) => p.sport === sport && p.audience === "adult");
          return (
            <div key={sport} className="flex shrink-0 gap-2 xl:flex-col xl:gap-1.5">
              <div className="hidden text-xs font-semibold uppercase tracking-wider text-muted xl:block">
                {SPORT_EMOJI[sport]} {STANDARDS[sport].label}
              </div>
              {items.map((p) => {
                const c = catalog.find((x) => x.key === p.key);
                const youth = p.youthKey ? productByKey(p.youthKey) : undefined;
                const active = p.key === current;
                return (
                  <div
                    key={p.key}
                    className={`card relative w-56 shrink-0 transition xl:w-full ${active ? "border-volt" : "hover:border-volt/60"}`}
                  >
                  <button
                    onClick={() => !active && onPick(p.key)}
                    aria-current={active ? "true" : undefined}
                    className="flex w-full items-center gap-3 rounded-2xl p-2 pr-14 text-left"
                  >
                    <JerseyPreview spec={defaultSpec(sport, p.key)} player={{ name: "", number: "" }} view="front" className="h-12 w-12 shrink-0" />
                    <div className="min-w-0">
                      <div className={`text-sm font-semibold leading-tight ${active ? "text-volt" : ""}`}>
                        <span className="xl:hidden">{SPORT_EMOJI[sport]} </span>
                        {p.label}
                      </div>
                      <div className="truncate text-xs text-muted">
                        {c?.fromPrice ? `From ${fmt(c.fromPrice)}` : "All-over print"}
                        {youth ? " · youth too" : ""}
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={() => setDetails(p.key)}
                    className="absolute bottom-2 right-2.5 text-[11px] text-muted underline underline-offset-2 hover:text-volt"
                    aria-label={`${p.label} details`}
                  >
                    Details
                  </button>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      {shown && (
        <ProductDetailsModal
          productKey={shown.key}
          label={shown.label}
          prices={pricesOf(shown.key)}
          youthPrices={pricesOf(shown.youthKey)}
          isCurrent={shown.key === current}
          onClose={() => setDetails(null)}
          onDesign={() => {
            setDetails(null);
            onPick(shown.key);
          }}
        />
      )}
    </nav>
  );
}
