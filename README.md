# Live2D Wallpaper

Windows 桌面 Live2D 壁纸原型。它把 Electron 窗口挂到桌面图标后方，并使用
MediaPipe Face Landmarker 将摄像头中的头部姿态、眨眼和张嘴映射到 Cubism 4 参数。

## 环境

- Windows 10/11
- Node.js 20 或更高版本
- 一个合法取得的 Cubism 4 `.model3.json` 模型及其完整资源目录
- Live2D Cubism SDK for Web 中的 `live2dcubismcore.min.js`

## 准备 Cubism Core

Live2D Cubism Core 不允许由本项目直接再分发。请从 Live2D 官方 Cubism SDK for Web
获取 `live2dcubismcore.min.js`，放到：

```text
src/renderer/public/vendor/live2dcubismcore.min.js
```

应用已预设从这个位置加载 Core，无需再修改 HTML。

## 运行

```powershell
npm install
npm run dev
```

生成 Windows 安装包：

```powershell
npm run dist
```

首次启用头部跟踪时，应用会请求摄像头权限，并从 Google 的 MediaPipe 官方模型存储
下载约 3 MB 的 Face Landmarker 模型。推理过程在本机完成，摄像头画面不会上传。

## 使用

1. 点击“选择 Live2D 模型”，选择模型目录中的 `.model3.json`。
2. 调整大小和位置。
3. 启用“摄像头头部跟踪”。
4. 点击“设为桌面壁纸”。

壁纸模式会启用鼠标穿透。按 `Ctrl+Shift+L` 或双击系统托盘图标，可随时退出壁纸
模式并恢复设置窗口。

## 已知限制

- 当前桌面挂载代码只支持 Windows。
- 部分模型使用自定义参数 ID，可能需要修改 `src/renderer/src/live2d.ts` 中的映射。
- Windows 资源管理器重启后，需要重新切换一次壁纸模式。
- 多显示器目前只覆盖主显示器。
