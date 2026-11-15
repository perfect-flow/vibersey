import "server-only";
import sharp from "sharp";
import { randomUUID } from "crypto";
import { supabaseAdmin } from "./supabase/admin";

// Make a logo's flat background transparent by flood-filling from the edges.
// Image models can't output transparency, so we ask for a plain white
// background and remove it here.
export async function knockOutBackground(input: Buffer, tolerance = 38): Promise<Buffer> {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const px = (i: number) => [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]];
  const bg = px(0);
  const close = (i: number) => {
    const [r, g, b] = px(i);
    return Math.abs(r - bg[0]) + Math.abs(g - bg[1]) + Math.abs(b - bg[2]) <= tolerance * 3;
  };
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
  while (stack.length) {
    const i = stack.pop()!;
    if (seen[i]) continue;
    seen[i] = 1;
    if (!close(i)) continue;
    data[i * 4 + 3] = 0;
    const x = i % w, y = (i / w) | 0;
    if (x > 0) stack.push(i - 1);
    if (x < w - 1) stack.push(i + 1);
    if (y > 0) stack.push(i - w);
    if (y < h - 1) stack.push(i + w);
  }
  return sharp(data, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}

export async function uploadPublic(bucket: "artwork" | "printfiles", bytes: Buffer, mime: string, prefix = "") {
  const ext = mime.includes("jpeg") ? "jpg" : mime.includes("webp") ? "webp" : mime.includes("svg") ? "svg" : "png";
  const path = `${prefix}${randomUUID()}.${ext}`;
  const db = supabaseAdmin();
  const { error } = await db.storage.from(bucket).upload(path, bytes, { contentType: mime, upsert: false });
  if (error) throw error;
  return db.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
