import { readdir, readFile, mkdir, writeFile, lstat } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { createHash } from "node:crypto";
import { zipSync } from "fflate";

const manifest = JSON.parse(await readFile("dist/manifest.json", "utf8"));
const source = JSON.parse(await readFile("manifest.json", "utf8"));
const pkg = JSON.parse(await readFile("package.json", "utf8"));
if (manifest.version !== source.version || source.version !== pkg.version)
  throw new Error("Build, manifest and package versions must match");
const tag = process.env.RELEASE_TAG;
if (tag && tag !== `v${pkg.version}`)
  throw new Error(`Release tag ${tag} must match v${pkg.version}`);

const rootFiles = new Set([
  "manifest.json",
  "background.js",
  "bridge.js",
  "content.js",
  "options.html",
  "popup.html",
  "offscreen.html",
  "NOTICE.md",
  "LICENSE",
]);
const localeFiles = ["en", "zh_CN", "zh_TW"].map(
  (locale) => `_locales/${locale}/messages.json`,
);
const entries = {};
async function collect(dir) {
  for (const name of (await readdir(dir)).sort()) {
    const path = resolve(dir, name);
    const info = await lstat(path);
    if (info.isSymbolicLink()) throw new Error("Symlinks cannot be packaged");
    if (info.isDirectory()) {
      await collect(path);
      continue;
    }
    const key = relative(resolve("dist"), path).replaceAll("\\", "/");
    if (
      !(
        rootFiles.has(key) ||
        /^assets\/[\w.-]+\.(js|css)$/.test(key) ||
        /^icons\/icon-(16|32|48|128)\.png$/.test(key) ||
        key === "licenses/fflate-MIT.txt" ||
        localeFiles.includes(key)
      )
    )
      throw new Error(`Unexpected build file: ${key}`);
    entries[key] = [
      new Uint8Array(await readFile(path)),
      { mtime: new Date(2020, 0, 1) },
    ];
  }
}
await collect(resolve("dist"));
for (const file of [...rootFiles, ...localeFiles])
  if (!entries[file]) throw new Error(`Missing runtime file: ${file}`);
await mkdir("release", { recursive: true });
const zip = zipSync(entries, { level: 9 });
const hash = createHash("sha256").update(zip).digest("hex");
const names = [
  `ai-original-export-${pkg.version}.zip`,
  "ai-original-export.zip",
];
for (const name of names) await writeFile(`release/${name}`, zip);
await writeFile(
  "release/SHA256SUMS.txt",
  names.map((name) => `${hash}  ${name}\n`).join(""),
);
console.log(
  `Packaged v${pkg.version}: ${Object.keys(entries).length} files, ${zip.length} bytes`,
);
