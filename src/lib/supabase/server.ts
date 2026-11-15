import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "../env";

export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(env.supabaseUrl(), env.supabaseAnonKey(), {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // called from a Server Component; middleware refreshes the session
        }
      },
    },
  });
}

export async function currentUser() {
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  return data.user ?? null;
}
