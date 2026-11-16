import { NextResponse } from "next/server";
import sharp from "sharp";
import { getActor } from "@/lib/usage";
import { prepareLogo, uploadPublic } from "@/lib/images";

export const maxDuration = 60;

const MAX_BYTES = 10 * 1024 * 1024;

// Upload a logo or an inspiration image. Logos are normalized to PNG with real
// transparency (a flat background is removed) so they print cleanly. The
// browser shrinks big files first, since Vercel rejects bodies over ~4.5 MB.
export async function POST(req: Request) {
  await getActor(); // ensures the visitor cookie exists
  const form = await req.formData();
  const file = form.get("file");
  const kind = form.get("kind") === "logo" ? "logo" : "inspiration";
  if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "File is larger than 10 MB" }, { status: 413 });
  if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type))
    return NextResponse.json({ error: "Please upload a PNG, JPG, WEBP or SVG image" }, { status: 415 });

  const input = Buffer.from(await file.arrayBuffer());
  let png: Buffer;
  try {
    // rasterize SVGs and cap the size; print resolution needs ~2000px for a chest logo
    png =
      kind === "logo"
        ? await prepareLogo(input)
        : await sharp(input).resize(2400, 2400, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
  } catch (e) {
    console.error("upload: couldn't read image", e);
    return NextResponse.json({ error: "Couldn't read that image. Try a PNG or JPG." }, { status: 400 });
  }
  try {
    const url = await uploadPublic("artwork", png, "image/png", kind === "logo" ? "upload-logo/" : "inspiration/");
    return NextResponse.json({ url });
  } catch (e) {
    console.error("upload: storage failed", e);
    return NextResponse.json({ error: `Upload failed: ${(e as Error).message ?? "storage error"}` }, { status: 500 });
  }
}
