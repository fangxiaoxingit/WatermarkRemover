# AI Original Image Export

[简体中文](README.zh-CN.md)

[Official website and installation guide](https://www.xiaoxinnote.com/ai-original-export) · [Download the latest version](https://github.com/fangxiaoxingit/WatermarkRemover/releases/latest/download/ai-original-export.zip)

Select and export original images provided by supported AI chat platforms. Save a single image, download selected images individually, or package them in a ZIP archive.

A Manifest V3 extension for desktop Chrome / Edge, requiring Chrome 116 or later. Currently supports Qianwen (千问) and Doubao (豆包), with other platforms possible in future versions. The extension extracts original images already available on the platform and does not repair pixels; the original images themselves may still contain watermarks.

## Download and installation

1. Download `ai-original-export.zip` from the [latest Release](https://github.com/fangxiaoxingit/WatermarkRemover/releases/latest) and extract it.
2. Open `chrome://extensions/` (`edge://extensions/` in Edge) and enable Developer mode.
3. Click **Load unpacked** and select the extracted folder containing `manifest.json`.
4. Refresh the chat or shared conversation page, then click **Export original images** ("导出原图") in the bottom-right corner. The toolbar entry provides settings and platform information.

To update, extract the new version, reload the extension, and refresh the chat or shared conversation page. The extension is currently distributed through GitHub and is not yet listed in browser extension stores.

## Features and supported platforms

- English and Simplified Chinese interfaces, following the browser UI language by default. Change the language in settings; your preference is remembered.
- Preview, enlarge, and select images; save a single image, download selected images individually, or create a ZIP archive.
- Export progress, cancellation, and retries for failed items. Tasks continue after the panel is closed.
- Up to 100 images or 200 MB per batch, preserving the original image bytes and formats.
- Qianwen: supports chat and shared conversation pages; recognizes only generated images already loaded in the current conversation.
- Doubao: supports chat pages and `/thread/` shared conversation pages; scroll up to load older images.

Platforms may change their internal data formats. Original image availability may vary for edited, redrawn, or enhanced images, and between accounts. Edge has not yet been tested.

## Privacy

Image detection and export run locally in the browser. There is no analytics reporting, project-operated backend, or remotely executed code. The extension runs only on supported platform pages and accesses image CDNs through an allowlist. Image requests do not include cookies or a Referrer header, and redirects are rejected.

The `downloads` permission saves images, `storage` stores language preferences, platform switches, and task state within a session, `activeTab` checks the current page from the toolbar, and `offscreen` processes images and ZIP archives. The source contains platform domain names and fictional test data, with no real chat histories or user-generated images.

## Development

Requires Node.js 22 or later:

```sh
cd extension
npm ci
npm test
npm run build
```

Load `extension/dist/` to debug the extension. For browser integration testing:

```sh
npx playwright install chromium
npm run test:browser
```

See [extension/README.en.md](extension/README.en.md) for more usage and code details.

## Automated releases

GitHub Actions runs tests and builds on pushes to the main branch and on Pull Requests. When a `v*` tag is pushed, the workflow verifies that the tag, `extension/manifest.json`, and `extension/package.json` have matching versions, then creates a Release, generates release notes, and uploads the installation package and a SHA-256 checksum file.

For the next release, synchronize these versions and the lockfile, commit the changes, then run:

```sh
git tag -a v0.2.7 -m "发布 v0.2.7"
git push origin main
git push origin v0.2.7
```

Replace the example tag with the version being released. The workflow can also be run manually: running it on a branch produces build artifacts only; running it on a version tag publishes or updates the Release for that tag.

To generate the same installation package locally, run `cd extension && npm run release`. Only runtime files from the build directory are packaged; internal documentation, sample images, and local configuration are excluded.

Stable download link for promotional pages: [Download the latest version](https://github.com/fangxiaoxingit/WatermarkRemover/releases/latest/download/ai-original-export.zip).

## License

This project uses the [MIT License](LICENSE). See [NOTICE](extension/NOTICE.md) for third-party dependencies and research references.
