// Browser-side prep for uploads. Vercel functions reject request bodies over
// ~4.5 MB, so big images are scaled down here first. Drawing to a canvas and
// saving as PNG keeps the alpha channel, so transparent logos stay transparent.

const MAX_BYTES = 4 * 1024 * 1024;
const MAX_SIDE = 2400;

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

export type PreparedImage = { file: Blob; name: string; transparent: boolean };

export async function prepareImage(file: File): Promise<PreparedImage> {
  // SVGs are vector and tiny; the server rasterizes them at print size
  if (file.type === "image/svg+xml") return { file, name: file.name, transparent: true };
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return { file, name: file.name, transparent: false }; // let the server try
  }
  const transparent = hasAlpha(bitmap);
  let side = Math.min(MAX_SIDE, Math.max(bitmap.width, bitmap.height));
  // already small enough and the right format: send the original bytes
  if (file.size <= MAX_BYTES && Math.max(bitmap.width, bitmap.height) <= MAX_SIDE && file.type !== "image/webp") {
    bitmap.close();
    return { file, name: file.name, transparent };
  }
  const base = file.name.replace(/\.[^.]+$/, "") || "image";
  for (let attempt = 0; attempt < 6; attempt++) {
    const k = side / Math.max(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * k));
    canvas.height = Math.max(1, Math.round(bitmap.height * k));
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    // PNG keeps transparency; opaque photos can be JPEG to stay small
    const blob = transparent ? await canvasBlob(canvas, "image/png") : await canvasBlob(canvas, "image/jpeg", 0.92);
    if (blob && blob.size <= MAX_BYTES) {
      bitmap.close();
      return { file: blob, name: `${base}.${transparent ? "png" : "jpg"}`, transparent };
    }
    side = Math.round(side * 0.75);
  }
  bitmap.close();
  throw new Error("That image is too large. Try one under 4 MB.");
}

// Sample the image small and look for any see-through pixels.
function hasAlpha(bitmap: ImageBitmap) {
  const s = 128;
  const canvas = document.createElement("canvas");
  canvas.width = s;
  canvas.height = s;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return false;
  ctx.drawImage(bitmap, 0, 0, s, s);
  const { data } = ctx.getImageData(0, 0, s, s);
  let clear = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 250) clear++;
  return clear / (s * s) > 0.01;
}
