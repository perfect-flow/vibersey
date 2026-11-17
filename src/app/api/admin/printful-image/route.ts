import { isAdmin } from "@/lib/admin";

// Read-only: fetch a Printful template image (admin debugging).
// GET /api/admin/printful-image?secret=...&url=https://...printful.com/...
export async function GET(req: Request) {
  if (!isAdmin(req)) return new Response("Unauthorized", { status: 401 });
  const raw = new URL(req.url).searchParams.get("url") ?? "";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return new Response("Bad url", { status: 400 });
  }
  if (url.protocol !== "https:" || !/(^|\.)printful\.com$/.test(url.hostname)) return new Response("Only Printful images", { status: 400 });
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) return new Response(`Upstream ${r.status}`, { status: 502 });
  return new Response(r.body, { headers: { "Content-Type": r.headers.get("content-type") ?? "image/png" } });
}
