import Link from "next/link";
import { currentUser } from "@/lib/supabase/server";

export async function Header() {
  let email: string | null = null;
  try {
    email = (await currentUser())?.email ?? null;
  } catch {
    // Supabase not configured yet
  }
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-ink/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        <Link href="/" className="font-display text-3xl tracking-wider text-white">
          VIBER<span className="text-volt">SEY</span>
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/" className="text-muted hover:text-white">
            Design
          </Link>
          {email ? (
            <>
              <Link href="/designs" className="text-muted hover:text-white">
                My designs
              </Link>
              <form action="/auth/signout" method="post">
                <button className="text-muted hover:text-white">Sign out</button>
              </form>
            </>
          ) : (
            <Link href="/login" className="btn-ghost">
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
