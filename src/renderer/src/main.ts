import './style.css'
import type { AppSettings } from '../../shared/types'
import { Live2DStage } from './live2d'
import { HeadTracker } from './tracker'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <main id="stage"></main>
  <video id="camera" muted playsinline></video>
  <button id="settings-toggle" title="打开设置">设置</button>
  <aside id="panel">
    <header>
      <div>
        <h1>Live2D Wallpaper</h1>
        <p id="status">准备就绪</p>
      </div>
      <button id="close-panel">×</button>
    </header>
    <button id="choose-model" class="primary">选择 Live2D 模型</button>
    <p id="model-name" class="muted">尚未选择模型</p>
    <label>模型大小 <output id="scale-value"></output>
      <input id="scale" type="range" min="0.1" max="1.2" step="0.01">
    </label>
    <label>水平位置
      <input id="position-x" type="range" min="0" max="1" step="0.01">
    </label>
    <label>垂直位置
      <input id="position-y" type="range" min="0.2" max="1.2" step="0.01">
    </label>
    <label class="row"><input id="tracking" type="checkbox"> 摄像头头部跟踪</label>
    <label>跟踪强度
      <input id="strength" type="range" min="0" max="2" step="0.05">
    </label>
    <label>平滑度
      <input id="smoothing" type="range" min="0.02" max="0.8" step="0.01">
    </label>
    <label class="row"><input id="mirror" type="checkbox"> 镜像摄像头预览</label>
    <div class="actions">
      <button id="wallpaper" class="primary">设为桌面壁纸</button>
      <button id="quit">退出</button>
    </div>
    <p class="hint">壁纸模式下窗口会鼠标穿透。按 Alt+Tab 返回设置窗口。</p>
  </aside>
`

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!
const stage = new Live2DStage($('#stage'))
const tracker = new HeadTracker()
const video = $('#camera') as HTMLVideoElement
const panel = $('#panel')
const status = $('#status')
let settings: AppSettings

function setStatus(message: string, error = false): void {
  status.textContent = message
  status.classList.toggle('error', error)
}

async function save(patch: Partial<AppSettings>): Promise<void> {
  settings = await window.desktop.saveSettings(patch)
}

async function loadModel(url: string): Promise<void> {
  setStatus('正在加载模型...')
  try {
    await stage.load(url)
    setStatus('模型已加载')
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true)
  }
}

async function setTracking(enabled: boolean): Promise<void> {
  await save({ trackingEnabled: enabled })
  if (!enabled) {
    tracker.stop()
    video.classList.remove('visible')
    setStatus('头部跟踪已关闭')
    return
  }

  setStatus('正在启动摄像头...')
  try {
    await tracker.start(video, settings.cameraId, (frame) => {
      stage.applyTracking(frame, settings.smoothing, settings.trackingStrength)
    })
    video.classList.add('visible')
    setStatus('头部跟踪中')
  } catch (error) {
    ($('#tracking') as HTMLInputElement).checked = false
    await save({ trackingEnabled: false })
    setStatus(`摄像头启动失败：${error instanceof Error ? error.message : String(error)}`, true)
  }
}

async function init(): Promise<void> {
  settings = await window.desktop.getSettings()
  const scale = $('#scale') as HTMLInputElement
  const x = $('#position-x') as HTMLInputElement
  const y = $('#position-y') as HTMLInputElement
  const tracking = $('#tracking') as HTMLInputElement
  const strength = $('#strength') as HTMLInputElement
  const smoothing = $('#smoothing') as HTMLInputElement
  const mirror = $('#mirror') as HTMLInputElement

  scale.value = String(settings.scale)
  x.value = String(settings.x)
  y.value = String(settings.y)
  tracking.checked = settings.trackingEnabled
  strength.value = String(settings.trackingStrength)
  smoothing.value = String(settings.smoothing)
  mirror.checked = settings.mirrorCamera
  $('#scale-value').textContent = `${Math.round(settings.scale * 100)}%`
  $('#model-name').textContent = settings.modelName ?? '尚未选择模型'
  $('#wallpaper').textContent = settings.wallpaperMode ? '退出壁纸模式' : '设为桌面壁纸'
  stage.setLayout(settings.x, settings.y, settings.scale)
  video.classList.toggle('mirrored', settings.mirrorCamera)

  if (settings.modelUrl) await loadModel(settings.modelUrl)
  if (settings.trackingEnabled) await setTracking(true)

  const updateLayout = async () => {
    const patch = {
      scale: Number(scale.value),
      x: Number(x.value),
      y: Number(y.value)
    }
    stage.setLayout(patch.x, patch.y, patch.scale)
    $('#scale-value').textContent = `${Math.round(patch.scale * 100)}%`
    await save(patch)
  }
  scale.addEventListener('input', updateLayout)
  x.addEventListener('input', updateLayout)
  y.addEventListener('input', updateLayout)
  tracking.addEventListener('change', () => setTracking(tracking.checked))
  strength.addEventListener('input', () => save({ trackingStrength: Number(strength.value) }))
  smoothing.addEventListener('input', () => save({ smoothing: Number(smoothing.value) }))
  mirror.addEventListener('change', async () => {
    video.classList.toggle('mirrored', mirror.checked)
    await save({ mirrorCamera: mirror.checked })
  })
}

$('#choose-model').addEventListener('click', async () => {
  const model = await window.desktop.chooseModel()
  if (!model) return
  $('#model-name').textContent = model.name
  await save({ modelUrl: model.url, modelName: model.name })
  await loadModel(model.url)
})
$('#settings-toggle').addEventListener('click', () => panel.classList.add('visible'))
$('#close-panel').addEventListener('click', () => panel.classList.remove('visible'))
$('#wallpaper').addEventListener('click', async () => {
  const enabled = !settings.wallpaperMode
  const active = await window.desktop.setWallpaperMode(enabled)
  await save({ wallpaperMode: active })
  $('#wallpaper').textContent = active ? '退出壁纸模式' : '设为桌面壁纸'
  panel.classList.toggle('visible', !active)
})
$('#quit').addEventListener('click', () => window.desktop.quit())
window.desktop.onWallpaperModeChanged(async (enabled) => {
  await save({ wallpaperMode: enabled })
  $('#wallpaper').textContent = enabled ? '退出壁纸模式' : '设为桌面壁纸'
  panel.classList.add('visible')
})

init()
