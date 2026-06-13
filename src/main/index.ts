import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  net,
  protocol,
  screen,
  Tray
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
let tray: Tray | null = null
const TRAY_ICON =
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAA9SURBVDhPY/B3e/qfEsyALkAqHsQGYAPoanAagA+gqx2EBhAC6OoxDCBkCLraQWoALkPQ1eA1gFg88AYAADb/09Mbt+sbAAAAAElFTkSuQmCC'

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
  const appSession = mainWindow.webContents.session
  appSession.setPermissionCheckHandler((webContents, permission) => {
    return webContents === mainWindow?.webContents && permission === 'media'
  })
  appSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(webContents === mainWindow?.webContents && permission === 'media')
  })

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

function restoreSettingsWindow(): void {
  if (!mainWindow) return
  detachFromDesktop(mainWindow)
  store.set('wallpaperMode', false)
  mainWindow.webContents.send('wallpaper:changed', false)
}

function createTray(): void {
  const icon = nativeImage.createFromBuffer(Buffer.from(TRAY_ICON, 'base64'))
  tray = new Tray(icon)
  tray.setToolTip('Live2D Wallpaper')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: '恢复设置窗口',
        click: restoreSettingsWindow
      },
      {
        label: '退出',
        click: () => app.quit()
      }
    ])
  )
  tray.on('double-click', restoreSettingsWindow)
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
    let active = false
    try {
      const display = screen.getDisplayMatching(mainWindow.getBounds())
      active = enabled
        ? attachToDesktop(mainWindow, display.bounds)
        : (detachFromDesktop(mainWindow), false)
    } catch (error) {
      console.error('Failed to change wallpaper mode:', error)
      detachFromDesktop(mainWindow)
    }
    store.set('wallpaperMode', active)
    return active
  })
  ipcMain.handle('mouse:passthrough', (_event, enabled: boolean) => {
    mainWindow?.setIgnoreMouseEvents(enabled, { forward: false })
  })
  ipcMain.handle('app:quit', () => app.quit())

  createWindow()
  createTray()

  globalShortcut.register('CommandOrControl+Shift+L', restoreSettingsWindow)
})

app.on('window-all-closed', () => app.quit())
app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  tray?.destroy()
})
