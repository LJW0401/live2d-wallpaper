import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  net,
  protocol,
  screen
} from 'electron'
import Store from 'electron-store'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, normalize, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { AppSettings } from '../shared/types'
import { attachToDesktop, detachFromDesktop } from './wallpaper'

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'live2d',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true
    }
  }
])

const defaults: AppSettings = {
  modelUrl: null,
  modelPath: null,
  modelName: null,
  scale: 0.35,
  x: 0.5,
  y: 1,
  trackingEnabled: false,
  cameraId: null,
  mirrorCamera: true,
  smoothing: 0.2,
  trackingStrength: 1,
  wallpaperMode: false
}

function repairSettingsFile(): void {
  const file = join(app.getPath('userData'), 'config.json')
  if (!existsSync(file)) return

  const content = readFileSync(file, 'utf8')
  const normalized = content.replace(/^\uFEFF/, '')
  try {
    JSON.parse(normalized)
    if (normalized !== content) writeFileSync(file, normalized, 'utf8')
  } catch {
    renameSync(file, `${file}.invalid-${Date.now()}`)
  }
}

repairSettingsFile()
const store = new Store<AppSettings>({ defaults })
const modelRoots = new Map<string, string>()
let mainWindow: BrowserWindow | null = null

function registerModelPath(modelFile: string): string {
  const token = randomUUID()
  modelRoots.set(token, dirname(modelFile))
  return `live2d://model/${token}/${encodeURIComponent(modelFile.split(/[\\/]/).pop()!)}`
}

function createWindow(): void {
  const display = screen.getPrimaryDisplay()
  mainWindow = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    frame: false,
    transparent: false,
    backgroundColor: '#111827',
    resizable: true,
    show: false,
    webPreferences: {
      preload: resolve(import.meta.dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true
    }
  })

  mainWindow.setMenuBarVisibility(false)
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
    store.set('wallpaperMode', false)
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(resolve(import.meta.dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  protocol.handle('live2d', (request) => {
    const url = new URL(request.url)
    const [, token, ...parts] = url.pathname.split('/')
    const root = token ? modelRoots.get(token) : undefined
    if (!root) return new Response('Unknown model', { status: 404 })

    const file = normalize(resolve(root, ...parts.map(decodeURIComponent)))
    if (relative(root, file).startsWith('..')) {
      return new Response('Invalid model path', { status: 403 })
    }
    return net.fetch(pathToFileURL(file).toString())
  })

  ipcMain.handle('settings:get', () => {
    const saved = store.get('modelPath')
    if (saved) store.set('modelUrl', registerModelPath(saved))
    return store.store
  })
  ipcMain.handle('settings:save', (_event, patch: Partial<AppSettings>) => {
    for (const [key, value] of Object.entries(patch)) {
      store.set(key as keyof AppSettings, value)
    }
    return store.store
  })
  ipcMain.handle('model:choose', async () => {
    if (!mainWindow) return null

    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择 Live2D 模型',
      properties: ['openFile'],
      filters: [{ name: 'Live2D 模型文件 (*.model3.json)', extensions: ['json'] }]
    })
    if (result.canceled || !result.filePaths[0]) return null

    const file = result.filePaths[0]
    const url = registerModelPath(file)
    const name = file.split(/[\\/]/).pop()!
    store.set('modelUrl', url)
    store.set('modelPath', file)
    store.set('modelName', name)
    return { url, name }
  })
  ipcMain.handle('wallpaper:set', (_event, enabled: boolean) => {
    if (!mainWindow) return false
    const active = enabled ? attachToDesktop(mainWindow) : (detachFromDesktop(mainWindow), false)
    store.set('wallpaperMode', active)
    return active
  })
  ipcMain.handle('mouse:passthrough', (_event, enabled: boolean) => {
    mainWindow?.setIgnoreMouseEvents(enabled, { forward: false })
  })
  ipcMain.handle('app:quit', () => app.quit())

  createWindow()

  globalShortcut.register('CommandOrControl+Shift+L', () => {
    if (!mainWindow) return
    detachFromDesktop(mainWindow)
    store.set('wallpaperMode', false)
    mainWindow.webContents.send('wallpaper:changed', false)
  })
})

app.on('window-all-closed', () => app.quit())
app.on('will-quit', () => globalShortcut.unregisterAll())
