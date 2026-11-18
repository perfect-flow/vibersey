"use client";

import { useMemo, useState } from "react";
import type { Placement } from "@/lib/catalog";
import type { DesignSpec, Player } from "@/lib/design-spec";
import { seamRisks } from "@/lib/seams";

// A warning on the builder canvas when a name, number, team name or logo is
// close enough to a seam that it could be sewn in or cut off (seams.ts).
export function SeamWarnings({ spec, player, onShow }: { spec: DesignSpec; player: Player; onShow: (id: string, placement: Placement) => void }) {
  const risks = useMemo(() => seamRisks(spec, player), [spec, player]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const key = (r: (typeof risks)[number]) => `${r.id}:${r.placement}:${r.where}`;
  const open = risks.filter((r) => !dismissed.has(key(r)));
  if (!open.length) return null;
  const r = open[0];
  return (
    <div role="alert" className="absolute inset-x-4 bottom-16 z-20 mx-auto flex max-w-xl flex-wrap items-center gap-2 rounded-xl border border-amber-400/60 bg-amber-950/95 px-3 py-2 text-sm text-amber-100 shadow-xl">
      <span aria-hidden className="text-amber-300">⚠</span>
      <span className="min-w-0 flex-1">
        {r.message} Move it away from the red seam area while dragging.
        {open.length > 1 && <span className="text-amber-300/80"> ({open.length - 1} more)</span>}
      </span>
      <button type="button" className="rounded-md border border-amber-300/50 px-2 py-0.5 text-xs" onClick={() => onShow(r.id, r.placement)}>
        Show me
      </button>
      <button type="button" className="text-xs text-amber-300/80 underline" onClick={() => setDismissed(new Set([...dismissed, key(r)]))}>
        Dismiss
      </button>
    </div>
  );
}
