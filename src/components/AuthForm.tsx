"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

// Passwordless sign-in / sign-up: one form for both.
export function AuthForm({ next = "/" }: { next?: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const { error } = await supabaseBrowser().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) {
      setError(error.message);
      setState("error");
    } else setState("sent");
  }

  if (state === "sent")
    return (
      <p className="rounded-lg bg-volt/10 p-4 text-sm text-volt">
        Check {email} for a sign-in link. Your design is saved and will be waiting for you.
      </p>
    );

  return (
    <form onSubmit={submit} className="space-y-3">
      <input
        type="email"
        required
        className="input"
        placeholder="you@team.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <button className="btn-primary w-full" disabled={state === "sending"}>
        {state === "sending" ? "Sending link…" : "Email me a sign-in link"}
      </button>
      {state === "error" && <p className="text-sm text-red-400">{error}</p>}
      <p className="text-xs text-muted">Free account. No password needed.</p>
    </form>
  );
}

export function SignupModal({ open, onClose, reason, next }: { open: boolean; onClose: () => void; reason: string; next: string }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-4xl tracking-wide">Create your free account</h2>
        <p className="mb-5 mt-1 text-sm text-muted">{reason}</p>
        <AuthForm next={next} />
        <button onClick={onClose} className="mt-4 w-full text-center text-xs text-muted hover:text-white">
          Not now
        </button>
      </div>
    </div>
  );
}
