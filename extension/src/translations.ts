// Chinese source text is the key and the Simplified Chinese translation.
export const english: Record<string, string> = {
  "AI 原图导出": "AI Original Image Export",
  "设置与帮助 · AI 原图导出": "Settings & help · AI Original Image Export",
  界面语言: "Interface language",
  跟随浏览器: "Follow browser",
  简体中文: "简体中文",
  English: "English",
  设置与帮助: "Settings & help",
  "让好图片，保持原本的样子。": "Keep great images just as they were created.",
  设置栏目: "Settings sections",
  "◈   支持平台": "◈   Supported platforms",
  "☷   使用说明": "☷   How to use",
  "本地处理，无需账号\n图片从平台直接保存到你的设备。":
    "Local processing, no account needed\nImages are saved directly from the platform to your device.",
  从你创作的地方开始: "Start where you create",
  "启用需要的平台，在聊天页或分享页发现并导出原图。":
    "Enable the platforms you use to find and export original images from chat or shared pages.",
  "启用{name}": "Enable {name}",
  "已启用{name}，请刷新已打开的聊天页或分享页。":
    "{name} is enabled. Refresh any open chat or shared pages.",
  "已停用{name}，已启动的下载会继续。":
    "{name} is disabled. Downloads already started will continue.",
  "保存失败：{error}": "Could not save: {error}",
  直接读取平台提供的原图: "Reads original images provided by the platform",
  "打开平台 ↗": "Open platform ↗",
  "开启平台表示允许识别图片；支持状态以实际验证为准。平台只提供水印版时，不会自动修复或重新生成。":
    "Enabling a platform allows image detection. Support depends on the platform's current behavior. When only a watermarked image is available, the extension cannot repair or regenerate it.",
  "几步，带走你的原图": "Take your original images with you",
  "首次安装或更新后，请刷新已打开的千问或豆包聊天页、分享页。":
    "After installation or an update, refresh any open Qianwen or Doubao chat or shared pages.",
  打开聊天或分享页: "Open a chat or shared page",
  "进入千问或豆包的聊天页，或直接打开其分享链接。等待生成图片加载完成；聊天页向上滚动可加载更多历史图片。":
    "Open a Qianwen or Doubao chat, or open a shared conversation link. Wait for generated images to load. In a chat, scroll up to load older images.",
  选择原图: "Select original images",
  "点击页面右下角“导出原图”。首次打开面板时默认选中已识别图片；之后新增的图片需要手动选择。":
    "Click “Export originals” in the bottom-right corner. Detected images are selected when you first open the panel; images found later need to be selected manually.",
  下载与保存: "Download and save",
  "可下载单张图片，点击“逐张下载”将选中图片分别保存，或点击“打包下载 ZIP”保存压缩包。每批最多 100 张或 200 MB。全选按钮上方会显示导出进度，保留原始格式、字节与分辨率。":
    "Save one image, use “Download individually” to save selected images as separate files, or use “Download ZIP” to create an archive. Each batch allows up to 100 images or 200 MB. Progress appears above Select all. Original formats, bytes, and resolution are preserved.",
  在面板查看进度: "View progress in the panel",
  "下载不会打开新页面。获取、打包和保存进度直接显示在图片面板；关闭面板也会继续，可重新打开查看结果。文件位于下载目录的“原图导出”文件夹。":
    "Downloads do not open a new page. Fetching, packing, and saving progress appears in the image panel. Downloads continue when the panel closes; reopen it to see results. Files are saved in the “Original Images” folder in your Downloads directory.",
  "下载不会打开新页面。获取、打包和保存进度直接显示在图片面板；关闭面板也会继续，可重新打开查看结果。文件位于下载目录的“{folder}”文件夹。":
    "Downloads do not open a new page. Fetching, packing, and saving progress appears in the image panel. Downloads continue when the panel closes; reopen it to see results. Files are saved in the “{folder}” folder in your Downloads directory.",
  遇到问题时: "Troubleshooting",
  "为什么没有识别到图片？": "Why were no images detected?",
  "确认该平台已启用，等待生成图片加载完成，再重新扫描。聊天页可向上滚动加载历史；分享页只识别当前分享中已加载的生成图，不包含上传的参考图。首次安装或更新后请刷新当前页面。":
    "Check that the platform is enabled, wait for generated images to load, and scan again. Scroll up in chats to load older images. Shared pages include only generated images already loaded in the current share, excluding uploaded reference images. Refresh the page after installation or an update.",
  "下载失败或链接过期怎么办？": "What if a download fails or a link expires?",
  "临时网络错误会自动重试。权限不足或签名过期时，请刷新当前聊天页或分享页重新导出；部分成功的 ZIP 会保留成功图片，并附未完成说明。在进度条旁点击“重试失败项”即可仅重试失败图片。逐张下载取消后重试，也只下载尚未保存的图片。":
    "Temporary network errors are retried automatically. For expired links or missing permissions, refresh the current chat or shared page and export again. A partially successful ZIP keeps successful images and includes a failure note. Click “Retry failed images” beside the progress bar to retry only failed images. Retrying a cancelled individual download also saves only images that have not been saved.",
  "分享链接也能导出吗？": "Can I export from a shared link?",
  "支持千问分享页和豆包 /thread/ 分享页。直接打开分享链接，等待图片加载后点击“导出原图”。仅导出当前分享公开展示、且平台提供原图资源的生成图片，不会读取其他聊天。":
    "Qianwen shared pages and Doubao /thread/ shared pages are supported. Open the link, wait for images to load, and click “Export originals”. Only generated images publicly shown in this share with an available original resource are exported. Other chats are not accessed.",
  "豆包导出的原图仍有水印？":
    "Why do exported Doubao images still have watermarks?",
  "部分账号或编辑场景返回的原图本身可能含水印。扩展提取平台提供的原始资源，不改变图片像素，也无法保证每张原图都无水印。":
    "Original images returned for some accounts or editing tools may contain watermarks. The extension extracts the original resource provided by the platform without changing pixels, so it cannot guarantee that every original image is watermark-free.",
  "为什么只看到了部分历史图片？": "Why are only some older images shown?",
  "豆包列表会按当前渲染内容增量识别，向上滚动加载更多后再打开面板。扩展不会主动遍历其他聊天。":
    "Doubao images are detected incrementally from currently rendered content. Scroll up to load more, then reopen the panel. The extension does not browse other chats.",
  开源参考: "Open-source references",
  "豆包原图字段调研参考。上游许可证为 GPL-3.0；本扩展独立实现页面读取、界面与下载流程。ZIP 使用 fflate（MIT）。":
    "A reference for researching Doubao original-image fields. The upstream project uses GPL-3.0; this extension independently implements page reading, its interface, and downloads. ZIP archives use fflate (MIT).",
  "无法读取设置。": "Could not read settings.",
  重试: "Retry",
  "图片 {index} 大图预览": "Large preview of image {index}",
  关闭大图预览: "Close large preview",
  "关闭（Esc）": "Close (Esc)",
  "图片 {index}": "Image {index}",
  "生成原图 {index}": "Generated original image {index}",
  "正在加载原图…": "Loading original image…",
  "{width} × {height} · 按 Esc 关闭": "{width} × {height} · Press Esc to close",
  "原图加载失败，链接可能已过期，请关闭预览并刷新聊天页重试。":
    "The original image could not be loaded. Its link may have expired. Close the preview and refresh the chat to try again.",
  取消: "Cancel",
  重试失败项: "Retry failed images",
  导出进度: "Export progress",
  正在准备导出: "Preparing export",
  导出原图: "Export originals",
  当前会话原图: "Original images in this conversation",
  "{platform} · 原图导出": "{platform} · Original image export",
  " · 原图导出": " · Original image export",
  关闭导出面板: "Close export panel",
  仅包含当前会话已加载的生成图片:
    "Only generated images loaded in this conversation",
  导出状态: "Export status",
  全选: "Select all",
  取消全选: "Deselect all",
  重新扫描: "Scan again",
  "已重新扫描；等待生成完成或向上滚动加载历史图片。":
    "Scanned again. Wait for generation to finish or scroll up to load older images.",
  复制链接: "Copy links",
  "已复制所选原图链接，链接可能过期。":
    "Copied links to selected original images. Links may expire.",
  "已识别 {count} 张 · 仅含当前会话已加载内容":
    "{count} detected · Only content loaded in this conversation",
  还没有发现可导出的原图: "No original images found yet",
  "等待图片生成完成，或向上滚动加载历史后重新扫描。首次安装请刷新当前页面。":
    "Wait for image generation to finish, or scroll up to load older images and scan again. Refresh this page after installation.",
  "选择图片 {index}": "Select image {index}",
  "放大图片 {index}": "Enlarge image {index}",
  放大查看: "Enlarge preview",
  原始尺寸: "Original dimensions",
  原图资源: "Original resource",
  打开原图: "Open original",
  下载: "Download",
  "已选择 {count} 张": "{count} selected",
  "保留原始画质 · 单批最多 100 张":
    "Original quality · Up to 100 images per batch",
  "打包下载 ZIP": "Download ZIP",
  逐张下载: "Download individually",
  "新增 {count} 张原图，尚未选中。":
    "{count} new original images found, not yet selected.",
  "把好图片，完整保存。": "Save great images in full quality.",
  "正在识别当前页面…": "Checking the current page…",
  打开图片面板: "Open image panel",
  "请刷新当前页面，再打开图片面板。":
    "Refresh the current page, then open the image panel.",
  "{name} · {status}": "{name} · {status}",
  已启用: "Enabled",
  "已停用，请在设置中启用": "Disabled; enable it in settings",
  "当前页面不支持，请打开千问或豆包聊天页、分享页。":
    "This page is not supported. Open a Qianwen or Doubao chat or shared page.",
  最近任务: "Recent tasks",
  "原页面已关闭，请重新打开聊天页或分享页。":
    "The original page is closed. Reopen the chat or shared page.",
  千问: "Qianwen",
  "导出聊天与分享页中，平台已提供的生成原图。保留原始画质与格式。":
    "Export original generated images provided by the platform on chat and shared pages. Preserve their original quality and format.",
  "聊天页与分享页 · 支持": "Chat and shared pages · Supported",
  "仅识别当前会话已加载的图片。参考图、水印变体与缩略图不会加入列表。":
    "Only images loaded in the current conversation are detected. Reference images, watermarked variants, and thumbnails are excluded.",
  豆包: "Doubao",
  "从聊天页与分享页的生成图片中读取原图资源，支持多图选择与批量保存。":
    "Read original resources for generated images on chat and shared pages. Select multiple images and save them in a batch.",
  "部分账号与区域重绘、智能编辑、变清晰结果可能仍含水印。平台未提供无水印版本时，扩展无法修复图片。":
    "Results from some accounts, regional redraw, smart editing, or image enhancement may still contain watermarks. If the platform does not provide a watermark-free version, the extension cannot repair it.",
  任务不存在: "Task not found",
  "任务已过期，请重新导出": "This task has expired. Export again.",
  任务不属于当前聊天: "This task does not belong to the current chat",
  "在不打开新标签页的情况下验证原始图片并创建下载文件 Blob":
    "Validate original images and create download Blobs without opening a new tab",
  "当前页面已有导出任务，请等待完成或取消":
    "An export is already running on this page. Wait for it to finish or cancel it.",
  "准备导出 {count} 张原图": "Preparing to export {count} original images",
  下载组件未能启动: "The download component could not start",
  下载组件启动失败: "The download component failed to start",
  无效来源: "Invalid source",
  不支持此页面: "This page is not supported",
  请从支持的聊天页或分享页导出: "Export from a supported chat or shared page",
  该平台已停用: "This platform is disabled",
  "每批最多 100 张": "Up to 100 images per batch",
  图片来源不受支持: "The image source is not supported",
  单张下载只支持一张图片: "A single-image download requires exactly one image",
  "正在导出，请稍候": "Export in progress. Please wait.",
  "所有图片已保存，无需重试": "All images have been saved; no retry is needed",
  "已取消 · 已保存 {count}/{total} 张，重试仅下载未保存图片":
    "Cancelled · {count}/{total} saved; retry downloads only unsaved images",
  "导出已取消，可重新选择图片下载":
    "Export cancelled. Select images to download again.",
  无效下载来源: "Invalid download source",
  保存尚未开始: "Saving has not started",
  无效状态: "Invalid status",
  浏览器尚未保存完成: "The browser has not finished saving",
  任务已结束: "This task has ended",
  无效文件来源: "Invalid file source",
  无效文件名: "Invalid filename",
  无效或重复的图片序号: "Invalid or duplicate image index",
  原图导出: "Original Images",
  "正在保存第 {index}/{total} 张原图": "Saving original image {index}/{total}",
  正在保存到下载文件夹: "Saving to the Downloads folder",
  不支持的操作: "Unsupported operation",
  操作失败: "Operation failed",
  "操作失败，请重试": "Operation failed. Please try again.",
  "扩展连接已失效，请刷新页面":
    "The extension connection has expired. Refresh the page.",
  没有可保存的图片: "No images available to save",
  "正在获取 {count} 张原图": "Fetching {count} original images",
  "正在获取第 {index}/{total} 张原图":
    "Fetching original image {index}/{total}",
  "单批超过 200 MB，请减少选择后分批导出":
    "This batch exceeds 200 MB. Select fewer images and export in batches.",
  "图片内容损坏，无法读取尺寸":
    "The image is damaged; its dimensions could not be read",
  "浏览器保存中断，请重试":
    "The browser save was interrupted. Please try again.",
  "已处理 {count}/{total} 张 · 成功 {saved} 张 · {size} MB":
    "{count}/{total} processed · {saved} successful · {size} MB",
  "已逐张保存 {count} 张原图，{failed} 张失败，可重试失败项":
    "{count} original images saved individually; {failed} failed. Retry failed images.",
  "已逐张保存 {count} 张原图，可在下载文件夹查看":
    "{count} original images saved individually. Find them in the Downloads folder.",
  "正在打包 {count} 张原图": "Packing {count} original images",
  正在准备原图: "Preparing original image",
  原图: "Original",
  "已保存 {count} 张原图，{failed} 张失败，可重试失败项":
    "{count} original images saved; {failed} failed. Retry failed images.",
  "已保存 {count} 张原图，可在下载文件夹查看":
    "{count} original images saved. Find them in the Downloads folder.",
  请先选择图片: "Select images first",
  "每批最多 100 张，请分批导出":
    "Up to 100 images per batch. Export in batches.",
  "图片来源或会话不匹配，请刷新页面重试":
    "The image source or conversation does not match. Refresh the page and try again.",
  "链接已过期或缺少权限，请刷新当前页面重新获取":
    "The link has expired or permission is missing. Refresh the current page to get a new link.",
  "获取失败（HTTP {status}）": "Fetch failed (HTTP {status})",
  "图片大小超过单批 200 MB 限制，请分批下载":
    "Images exceed the 200 MB batch limit. Download in smaller batches.",
  "平台返回了非图片内容，请刷新当前页面重试":
    "The platform returned non-image content. Refresh the current page and try again.",
  图片内容为空: "The image is empty",
  文件不是受支持的图片或内容已损坏:
    "The file is not a supported image or is damaged",
  "网络失败，请检查连接后重试":
    "Network request failed. Check your connection and try again.",
  网络失败: "Network request failed",
  "未完成.txt": "Incomplete.txt",
  "图片 {index}：{error}": "Image {index}: {error}",
  "[链接已隐藏]": "[URL hidden]",
  状态未知: "Unknown status",
  准备中: "Preparing",
  获取图片: "Fetching images",
  打包中: "Packing",
  浏览器保存中: "Saving in browser",
  已完成: "Completed",
  部分失败: "Partially failed",
  失败: "Failed",
  已取消: "Cancelled",
};
