import { build } from "vite";
import { mkdir, writeFile, copyFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
const root = process.cwd();
await build({
  root,
  publicDir: false,
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        options: resolve(root, "options.html"),
        popup: resolve(root, "popup.html"),
        offscreen: resolve(root, "offscreen.html"),
      },
    },
  },
});
for (const entry of ["content", "bridge", "background"])
  await build({
    root,
    publicDir: false,
    build: {
      outDir: "dist",
      emptyOutDir: false,
      lib: {
        entry: resolve(root, `src/${entry}.ts`),
        name: `WR_${entry}`,
        formats: ["iife"],
        fileName: () => `${entry}.js`,
      },
      rollupOptions: { output: { inlineDynamicImports: true } },
    },
  });
await copyFile("manifest.json", "dist/manifest.json");
await copyFile("NOTICE.md", "dist/NOTICE.md");
await copyFile("../LICENSE", "dist/LICENSE");
await mkdir("dist/licenses", { recursive: true });
await copyFile("node_modules/fflate/LICENSE", "dist/licenses/fflate-MIT.txt");
await mkdir("dist/icons", { recursive: true });
for (const size of [16, 32, 48, 128])
  await copyFile(`icons/icon-${size}.png`, `dist/icons/icon-${size}.png`);
console.log("Extension ready: extension/dist");
