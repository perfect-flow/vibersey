"use client";

import { useEffect, useRef, useState } from "react";
import type { DesignSpec, Player } from "@/lib/design-spec";

type Image = { url: string; title: string };

// "See it on a model": dresses product photos of real models in this design
// and shows them in a gallery. Photos are kept per design version, both here
// (instant when reopened) and on the server.
const seen = new Map<string, Image[]>();
const versionKey = (designId: string, spec?: DesignSpec, player?: Player) => `${designId}:${JSON.stringify({ spec, player })}`;

async function download(img: Image, i: number) {
  try {
    const blob = await (await fetch(img.url)).blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `vibersey-model-${i + 1}.${blob.type.includes("png") ? "png" : "jpg"}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  } catch {
    window.open(img.url, "_blank");
  }
}
export function ModelPreviewButton(props: {
  getDesignId: () => Promise<string | null>; // creates/saves the design if needed
  spec?: DesignSpec; // live spec for an editable design
  player?: Player;
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={props.className ?? "btn-ghost"} onClick={() => setOpen(true)}>
        {props.label ?? "See it on a model"}
      </button>
      {open && <ModelPreviewDialog {...props} onClose={() => setOpen(false)} />}
    </>
  );
}

function ModelPreviewDialog({
  getDesignId,
  spec,
  player,
  onClose,
}: {
  getDesignId: () => Promise<string | null>;
  spec?: DesignSpec;
  player?: Player;
  onClose: () => void;
}) {
  const [images, setImages] = useState<Image[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    (async () => {
      const designId = await getDesignId();
      if (!designId) return setError("Save the design first, then try again.");
      const vk = versionKey(designId, spec, player);
      const known = seen.get(vk);
      if (known) return setImages(known);
      const r = await fetch("/api/mockups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ designId, spec, player }),
      });
      let d = await r.json().catch(() => ({ error: "Couldn't start the model preview." }));
      if (!r.ok) return alive.current && setError(d.error);
      // Printful usually takes 10 to 40 seconds
      for (let i = 0; d.status === "pending" && i < 40 && alive.current; i++) {
        await new Promise((res) => setTimeout(res, 3000));
        const p = await fetch(`/api/mockups?task=${encodeURIComponent(d.task)}&key=${d.key}`);
        d = { ...d, ...(await p.json().catch(() => ({ status: "failed", error: "Couldn't load the model preview." }))) };
      }
      if (!alive.current) return;
      if (d.status !== "completed" || !d.images?.length) return setError(d.error ?? "The preview is taking too long. Please try again.");
      seen.set(vk, d.images);
      setImages(d.images);
    })();
    return () => {
      alive.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={onClose}>
      <div className="card relative w-full max-w-3xl p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-3xl tracking-wide">On a model</h2>
          <button className="text-sm text-muted underline" onClick={onClose}>
            Close
          </button>
        </div>
        {error ? (
          <p className="py-16 text-center text-red-400">{error}</p>
        ) : !images ? (
          <div className="py-16 text-center text-muted">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-line border-t-[var(--color-volt)]" />
            Dressing the models in your design. This takes about 20 to 40 seconds the first time.
          </div>
        ) : (
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={images[active].url} alt={images[active].title} className="mx-auto max-h-[60vh] w-auto rounded" />
            <div className="mt-2 flex items-center justify-center gap-3 text-xs text-muted">
              <span>{images[active].title}</span>
              <button className="btn-ghost px-3 py-1 text-xs" onClick={() => download(images[active], active)}>
                Download
              </button>
            </div>
            {images.length > 1 && (
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {images.map((img, i) => (
                  <button key={img.url} onClick={() => setActive(i)} className={`shrink-0 rounded border-2 ${i === active ? "border-[var(--color-volt)]" : "border-transparent"}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.url} alt={img.title} className="h-20 w-20 rounded object-cover" />
                  </button>
                ))}
              </div>
            )}
            <p className="mt-3 text-xs text-muted">Colors on screen can differ slightly from the printed jersey.</p>
          </div>
        )}
      </div>
    </div>
  );
}
