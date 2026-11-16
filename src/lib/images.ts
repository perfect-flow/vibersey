import "server-only";
import sharp from "sharp";
import { randomUUID } from "crypto";
import { supabaseAdmin } from "./supabase/admin";

// Pick the background color from the four corners. Returns null when the
// corners disagree (a photo, a gradient, or art that runs to the edge), in
// which case there's no flat background to remove.
function cornerBackground(data: Buffer, w: number, h: number, tolerance: number) {
  const at = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    return [data[i], data[i + 1], data[i + 2], data[i + 3]];
  };
  const corners = [at(0, 0), at(w - 1, 0), at(0, h - 1), at(w - 1, h - 1)];
  const bg = [0, 1, 2].map((c) => corners.map((p) => p[c]).sort((a, b) => a - b)[1]);
  const agree = corners.filter((p) => Math.abs(p[0] - bg[0]) + Math.abs(p[1] - bg[1]) + Math.abs(p[2] - bg[2]) <= tolerance * 3);
  return agree.length >= 3 ? bg : null;
}

// Make a logo's flat background transparent by flood-filling from the edges,
// with a soft edge so the outline isn't jagged or ringed in the old color.
// Image models can't output transparency, so we ask for a plain white
// background and remove it here. Customer logos saved as JPG (or "transparent"
// PNGs that are really white) go through the same step.
export async function knockOutBackground(input: Buffer, tolerance = 40): Promise<Buffer> {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const bg = cornerBackground(data, w, h, tolerance);
  if (!bg) return sharp(data, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
  const dist = (i: number) =>
    (Math.abs(data[i * 4] - bg[0]) + Math.abs(data[i * 4 + 1] - bg[1]) + Math.abs(data[i * 4 + 2] - bg[2])) / 3;

  // 1. flood fill the background from every edge pixel
  const isBg = new Uint8Array(w * h);
  const stack: number[] = [];
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
  while (stack.length) {
    const i = stack.pop()!;
    if (isBg[i] || dist(i) > tolerance) continue;
    isBg[i] = 1;
    const x = i % w, y = (i / w) | 0;
    if (x > 0) stack.push(i - 1);
    if (x < w - 1) stack.push(i + 1);
    if (y > 0) stack.push(i - w);
    if (y < h - 1) stack.push(i + w);
  }
  // 2. clear it, and fade the anti-aliased pixels that touch it
  for (let i = 0; i < w * h; i++) {
    if (isBg[i]) {
      data[i * 4 + 3] = 0;
      continue;
    }
    const x = i % w, y = (i / w) | 0;
    const touches = (x > 0 && isBg[i - 1]) || (x < w - 1 && isBg[i + 1]) || (y > 0 && isBg[i - w]) || (y < h - 1 && isBg[i + w]);
    if (!touches) continue;
    const d = dist(i);
    if (d >= tolerance * 3) continue;
    const a = Math.max(0, Math.min(1, (d - tolerance) / (tolerance * 2)));
    // un-mix the background color so the edge isn't haloed
    for (let c = 0; c < 3; c++) {
      const v = a > 0 ? (data[i * 4 + c] - bg[c] * (1 - a)) / a : data[i * 4 + c];
      data[i * 4 + c] = Math.max(0, Math.min(255, Math.round(v)));
    }
    data[i * 4 + 3] = Math.round(data[i * 4 + 3] * a);
  }
  return sharp(data, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}

// True when at least a little of the image is see-through, i.e. the customer
// already removed the background themselves.
export async function hasTransparency(input: Buffer): Promise<boolean> {
  const meta = await sharp(input).metadata();
  if (!meta.hasAlpha) return false;
  const { data } = await sharp(input).resize(256, 256, { fit: "inside" }).ensureAlpha().extractChannel(3).raw().toBuffer({ resolveWithObject: true });
  let clear = 0;
  for (let i = 0; i < data.length; i++) if (data[i] < 250) clear++;
  return clear / data.length > 0.01;
}

// Normalize a customer logo to a print-ready PNG with real transparency.
// Logos that already have transparency are kept exactly as drawn; logos on a
// flat background get it removed.
export async function prepareLogo(input: Buffer): Promise<Buffer> {
  const png = await sharp(input, { density: 300 }).resize(2400, 2400, { fit: "inside" }).ensureAlpha().png().toBuffer();
  if (await hasTransparency(png)) return png;
  return knockOutBackground(png);
}

export async function uploadPublic(bucket: "artwork" | "printfiles", bytes: Buffer, mime: string, prefix = "") {
  const ext = mime.includes("jpeg") ? "jpg" : mime.includes("webp") ? "webp" : mime.includes("svg") ? "svg" : "png";
  const path = `${prefix}${randomUUID()}.${ext}`;
  const db = supabaseAdmin();
  const { error } = await db.storage.from(bucket).upload(path, bytes, { contentType: mime, upsert: false });
  if (error) throw error;
  return db.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
