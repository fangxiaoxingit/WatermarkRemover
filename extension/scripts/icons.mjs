import { chromium } from "playwright";
import { readFile, writeFile, mkdir } from "node:fs/promises";
const svg = await readFile("icons/source.svg", "utf8");
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  for (const size of [16, 32, 48, 128]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<style>html,body{margin:0;background:transparent}svg{width:${size}px;height:${size}px;display:block}</style>${svg}`,
    );
    await page.screenshot({
      path: `icons/icon-${size}.png`,
      omitBackground: true,
    });
  }
  await mkdir("output", { recursive: true });
  await page.setViewportSize({ width: 640, height: 240 });
  await page.setContent(
    `<body style="margin:0;background:#f7f8fd;display:flex;align-items:center;justify-content:center;gap:48px;height:240px;font:12px system-ui;color:#71758c">${[16, 32, 48, 128].map((size) => `<div style="display:flex;flex-direction:column;align-items:center;gap:20px">${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}<span>${size} px</span></div>`).join("")}</body>`,
  );
  await page.screenshot({ path: "output/icon-sizes.png" });
} finally {
  await browser.close();
}
