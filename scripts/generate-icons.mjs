/**
 * Generate PWA icons for PickleBaddies.
 * Run once: node scripts/generate-icons.mjs
 */
import { createRequire } from "module";
import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
// sharp lives in the pnpm virtual store
const sharp = require("/home/user/picklebaddies/node_modules/.pnpm/node_modules/sharp");

const svgTemplate = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${size * 0.15}" fill="#0f172a"/>
  <text x="50%" y="57%" font-size="${size * 0.52}" text-anchor="middle" dominant-baseline="middle"
        font-family="sans-serif">🏸</text>
  <text x="50%" y="87%" font-size="${size * 0.1}" text-anchor="middle" dominant-baseline="middle"
        font-family="sans-serif" fill="#94a3b8" font-weight="600">PICKLEBADDIES</text>
</svg>`;

async function generate(size, filename) {
  const svg = Buffer.from(svgTemplate(size));
  const outPath = resolve(__dirname, `../apps/web/public/icons/${filename}`);
  await sharp(svg).resize(size, size).png().toFile(outPath);
  console.log(`  ✓ ${filename} (${size}x${size})`);
}

console.log("Generating PWA icons…");
await generate(192, "icon-192.png");
await generate(512, "icon-512.png");
console.log("Done.");
