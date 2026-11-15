import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "../env";

// Service-role client: bypasses RLS. Server routes only.
export function supabaseAdmin() {
  return createClient(env.supabaseUrl(), env.supabaseServiceKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
