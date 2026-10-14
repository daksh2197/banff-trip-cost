// Draws the PNG icons from public/icon.svg. Run once by hand: `node scripts/make-icons.mjs`.
// It needs `sharp`, which is not a dependency of this repo, so install it somewhere temporary first.
import { readFileSync } from 'node:fs';
import sharp from 'sharp';

const svg = readFileSync(new URL('../public/icon.svg', import.meta.url));
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  await sharp(svg, { density: 384 }).resize(size, size).png().toFile(new URL(`../public/${name}`, import.meta.url).pathname);
}
