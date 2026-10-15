import sharp from "sharp";

/** EXIF-rotate, JPEG q85, longest side <= 1024, short side >= 256. In memory only. */
export async function prepare(input: Buffer): Promise<Buffer> {
  const m = await sharp(input).metadata();
  let w = m.width ?? 0, h = m.height ?? 0;
  if (!w || !h) throw new Error("no dimensions");
  if ((m.orientation ?? 1) >= 5) [w, h] = [h, w];
  const scale = Math.max(Math.min(1024 / Math.max(w, h), 1), 256 / Math.min(w, h));
  return sharp(input)
    .rotate()
    .resize(Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale)))
    .jpeg({ quality: 85 })
    .toBuffer();
}
