# AI Original Image Export v0.2.7

[简体中文](README.md)

A Manifest V3 extension for desktop Chrome / Edge, requiring Chrome 116 or later. It reads original images already provided by the platform locally, with a compact five-column preview, image selection, single-image saving, individual batch downloads, ZIP packaging, and settings and help. It does not repair pixels or regenerate images.

## Installation and updates

1. Download and extract the package from the [latest Release](https://github.com/fangxiaoxingit/WatermarkRemover/releases/latest), or run `npm ci` and `npm run build` in this directory.
2. Open `chrome://extensions/` (`edge://extensions/` in Edge) and enable Developer mode.
3. Click **Load unpacked** and select `dist/` if you built from source, or the extracted package folder containing `manifest.json`.
4. If an older version is already installed, click **Reload**, then refresh the Qianwen (千问) or Doubao (豆包) chat or shared conversation page.
5. Click the blue-purple **Export original images** ("导出原图") button in the bottom-right corner of the chat or shared conversation page. Settings and help are also available from the toolbar entry.

The distributable package is `ai-original-export.zip`. After extracting it, load the folder containing `manifest.json`.

## Usage

- Use the language selector at the top-right of settings to choose **Follow browser**, **简体中文**, or **English**. The default follows the browser UI language, with unsupported languages falling back to English and Chinese regional variants using Simplified Chinese. Manual preferences are saved in the current browser. Switching languages preserves image selection, previews, and running export tasks.
- When the panel first opens, recognized images are selected by default. Newly detected images are not selected automatically afterward. Closing and reopening the panel preserves the selection.
- Desktop previews show 5 images per row, approximately 116×155 pixels each, using a 3:4 portrait layout. Narrow screens automatically switch to 2 columns.
- Click the enlargement icon in the bottom-right corner of a thumbnail to preview it on the current page at its original aspect ratio. Close the preview with its close button, by clicking the background, or by pressing Esc; the image selection is preserved.
- Single-image downloads, individual batch downloads, and ZIP exports do not open a new page. Progress for fetching, packaging, browser saving, and completion appears above the Select all button.
- Exports continue after the panel is closed or you navigate to another page. Return to the original chat to view the status. Do not reload the extension or close the browser during a download.
- **Download individually** ("逐张下载") is to the left of the ZIP button. It saves separate image files in selection order. After an individual download task is cancelled or fails, a retry downloads only images that have not been saved and preserves their original file numbering.
- Cancellation and failure retries are supported. After a ZIP export succeeds with some images missing, you can retry only the failed images. If the browser fails to save the export, retry the entire batch of unsaved images.
- Each batch is limited to 100 images or 200 MB. Files are saved in the `原图导出` (Chinese) or `Original Images` (English) subfolder of the default download directory. Files with the same name are not overwritten. Filenames and ZIP failure notes use the language selected when the task starts, even if you switch the interface language while it runs.
- Supports Qianwen chat and shared conversation pages, as well as Doubao chat pages and `/thread/` shared conversation pages. Doubao detection includes only generated images currently rendered on the page; scrolling up incrementally detects older content.
- Original images supplied by the platform may still contain visible watermarks. The extension extracts the original resources and does not guarantee removal of those watermarks.

## Development and verification

- `npm test`: parsing, boundary, download, cancellation, and retry tests.
- `npm run build`: strict TypeScript checks and extension build.
- `npm run test:browser`: integration tests of the actual extension in an isolated Chromium instance. Run `npx playwright install chromium` before the first test.
- `node scripts/icons.mjs`: render 16 / 32 / 48 / 128 px icons from `icons/source.svg`.
- `npm run format`: format the source code.

`src/adapters.ts` parses resources, `src/bridge.ts` reads page data without modifying it, and `src/content.ts` displays the panel and progress. `src/background.ts` validates tasks, maintains progress, and invokes browser downloads; `src/offscreen.ts` fetches, validates, and packages original images in a hidden document. The background communicates with the hidden document only through runtime messages; Blobs are not passed to the host webpage.

The icon is a solid eraser with a removal mark in the theme color `#4D55CC`, on a transparent background. The toolbar and extension management page use PNG icons; in-page icons use same-origin SVGs.

Automated browser tests use fictional data structures and synthetic images. They do not replace acceptance testing against new versions of the actual platforms.

## References and license

See [NOTICE.md](./NOTICE.md). This project does not copy the implementation of the Doubao reference project. It has no remotely executed code, analytics reporting, or project-operated backend.

## v0.2.5 changes

- Fixed downloads failing with "Unsupported image source" ("图片来源不受支持") when first opening a conversation or switching chats without refreshing. The background validates the session against the current tab URL provided by the browser; task queries, cancellation, and retries use the same validation.
- Added support for Doubao `/thread/` shared conversation pages. The current share is validated against the image component's `shareId`, and only the original `image_ori_raw` resource is extracted.
- Added regression tests for SPA downloads and task ownership, original image detection on shared conversation pages, and downloads. Image sources and conversation scope remain restricted.

## v0.2.6 changes

- Updated settings, usage instructions, the shared-link FAQ, in-page messages, and installation and update documentation to clarify support for Qianwen and Doubao chat and shared conversation pages.
- Retained the SPA download fix and Doubao shared conversation support introduced in v0.2.5.

## v0.2.7 changes

- Added Simplified Chinese and English interfaces. The default follows the browser UI language, and manual choices in settings are saved.
- Live language changes preserve image selection, previews, scroll position, and running export tasks. Download filenames and ZIP failure notes use the language selected when the task starts.
- Localized extension metadata, settings, the popup, and export progress. Improved language selector arrow spacing and narrow-screen English layouts.
- Added English documentation for the repository and extension, with regression coverage for language switching, preference synchronization, and downloads.
