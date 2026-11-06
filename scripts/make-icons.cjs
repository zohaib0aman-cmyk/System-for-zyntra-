// Renders the PWA icons into public/icons and src/app/apple-icon.png.
// Run: node scripts/make-icons.cjs  (uses the Playwright Chromium that is installed)
const { chromium } = require("playwright");
const path = require("node:path");

const logo = (size, pad, rounded) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="${rounded ? 14 : 0}" fill="#4f46e5"/>
  <g transform="translate(${32 - 32 * (1 - pad)} ${32 - 32 * (1 - pad)}) scale(${1 - pad})">
    <path d="M18 20h28L22 44h24" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`;
const badge = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
  <path d="M18 20h28L22 44h24" stroke="#fff" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const out = (f) => path.join(__dirname, "..", f);
const jobs = [
  ["public/icons/icon-192.png", 192, logo(192, 0, true)],
  ["public/icons/icon-512.png", 512, logo(512, 0, true)],
  ["public/icons/maskable-512.png", 512, logo(512, 0.25, false)],
  ["public/icons/badge-96.png", 96, badge(96)],
  ["src/app/apple-icon.png", 180, logo(180, 0.1, false)],
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const [file, size, svg] of jobs) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
    await page.locator("svg").screenshot({ path: out(file), omitBackground: true });
    console.log("wrote", file);
  }
  await browser.close();
})();
