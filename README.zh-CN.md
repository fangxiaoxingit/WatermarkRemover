# AI 原图导出

[English](README.md)

[官网与安装指南](https://www.xiaoxinnote.com/ai-original-export) · [下载最新版](https://github.com/fangxiaoxingit/WatermarkRemover/releases/latest/download/ai-original-export.zip)

从支持的 AI 聊天平台中选择并导出平台提供的原始图片，支持单张下载、批量逐张保存和 ZIP 打包。

桌面 Chrome / Edge 扩展，使用 Manifest V3，最低 Chrome 116。当前支持千问、豆包，后续可扩展其他平台。扩展提取平台已有的原图，不进行像素修复；原图本身仍可能含水印。

## 下载与安装

1. 从 [最新 Release](https://github.com/fangxiaoxingit/WatermarkRemover/releases/latest) 下载 `ai-original-export.zip` 并解压。
2. 打开 `chrome://extensions/`（Edge 为 `edge://extensions/`），启用开发者模式。
3. 点击“加载未打包的扩展程序”，选择解压后包含 `manifest.json` 的目录。
4. 刷新聊天页或分享页，点击右下角“导出原图”；工具栏入口提供设置与平台说明。

更新时解压新版本，重新加载扩展并刷新聊天页或分享页。当前通过 GitHub 分发，尚未上架浏览器扩展商店。

## 功能与支持范围

- 支持简体中文与英文界面，默认跟随浏览器界面语言；可在设置页切换并记住偏好。
- 图片预览、放大、选择，单张保存、批量逐张下载和 ZIP 打包。
- 导出进度、取消和失败重试；关闭面板后任务继续运行。
- 每批最多 100 张或 200 MB，保留原始图片字节和格式。
- 千问：支持聊天页和分享页；仅识别当前会话已加载的生成图片。
- 豆包：支持聊天页和 `/thread/` 分享页；历史图片需向上滚动加载。

平台内部数据格式可能变化，编辑、重绘、变清晰等结果及不同账号的原图可用性可能不同。Edge 尚未实测。

## 隐私

图片识别和导出在浏览器本地完成。没有统计上报、自建后端或远程执行代码。扩展只在支持的平台页面运行，按白名单访问图片 CDN；获取图片时不携带 Cookie、不发送 Referrer，并拒绝重定向。

`downloads` 用于保存图片，`storage` 用于语言偏好、平台开关及会话内任务状态，`activeTab` 用于工具栏检查当前页面，`offscreen` 用于处理图片与 ZIP。源码中保留的是平台域名和虚构测试数据，不包含真实聊天记录或用户生成图片。

## 开发

需要 Node.js 22 或更新版本：

```sh
cd extension
npm ci
npm test
npm run build
```

加载 `extension/dist/` 即可调试。浏览器集成验证：

```sh
npx playwright install chromium
npm run test:browser
```

更多使用和代码说明见 [extension/README.md](extension/README.md)。

## 自动发布

GitHub Actions 在主分支推送和 Pull Request 时运行测试与构建。推送 `v*` 标签时，核对标签、`extension/manifest.json` 和 `extension/package.json` 版本一致后，自动创建 Release、生成更新记录并上传安装包和 SHA-256 校验文件。

发布下一版时，先同步上述版本与锁文件，提交后执行：

```sh
git tag -a v0.2.7 -m "发布 v0.2.7"
git push origin main
git push origin v0.2.7
```

示例标签需替换为待发布版本。工作流也可手动运行：在分支上运行仅生成构建产物，在版本标签上运行会发布或更新该标签的 Release。

本地生成相同安装包：`cd extension && npm run release`。仅打包构建目录的运行文件，内部文档、样本图片和本地配置不会进入安装包。

固定下载地址，方便宣传页使用：[下载最新版](https://github.com/fangxiaoxingit/WatermarkRemover/releases/latest/download/ai-original-export.zip)。

## 许可

本项目使用 [MIT License](LICENSE)。第三方依赖和调研参考见 [NOTICE](extension/NOTICE.md)。
