import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { prepare } from "../src/prep.ts";

const img = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: "#c33" } }).png().toBuffer();
const dims = async (b: Buffer) => { const m = await sharp(b).metadata(); return [m.width, m.height, m.format]; };

test("panorama 4000x500 is fit to 1024 then padded to 280 tall", async () => {
  assert.deepEqual(await dims(await prepare(await img(4000, 500))), [1024, 280, "jpeg"]);
});
test("tiny square is padded to 280x280", async () => {
  assert.deepEqual(await dims(await prepare(await img(100, 100))), [280, 280, "jpeg"]);
});
test("large image fits inside 1024", async () => {
  assert.deepEqual(await dims(await prepare(await img(3000, 2000))), [1024, 683, "jpeg"]);
});
test("non-image rejects", async () => {
  await assert.rejects(prepare(Buffer.from("nope")));
});
