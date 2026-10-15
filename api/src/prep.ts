import sharp from "sharp";

const MIN_SIDE = 280; // both sides >= 280 gives >= 78,400 px, TypeSafe's minimum area, and >= 256 per side

/** EXIF-rotate, fit inside 1024x1024, pad with gray to at least 280 per side, JPEG q85. In memory only. */
export async function prepare(input: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(input, { limitInputPixels: 50_000_000 })
    .rotate()
    .flatten({ background: "#808080" })
    .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const padX = Math.max(0, MIN_SIDE - info.width), padY = Math.max(0, MIN_SIDE - info.height);
  let img = sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } });
  if (padX || padY)
    img = img.extend({
      left: Math.floor(padX / 2), right: Math.ceil(padX / 2), top: Math.floor(padY / 2), bottom: Math.ceil(padY / 2),
      background: "#808080",
    });
  return img.jpeg({ quality: 85 }).toBuffer();
}
