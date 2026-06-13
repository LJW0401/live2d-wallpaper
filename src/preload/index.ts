import { contextBridge, ipcRenderer } from 'electron'
import type { AppSettings, DesktopApi } from '../shared/types'

const api: DesktopApi = {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: Partial<AppSettings>) => ipcRenderer.invoke('settings:save', settings),
  chooseModel: () => ipcRenderer.invoke('model:choose'),
  setWallpaperMode: (enabled: boolean) => ipcRenderer.invoke('wallpaper:set', enabled),
  onWallpaperModeChanged: (callback) => {
    ipcRenderer.on('wallpaper:changed', (_event, enabled: boolean) => callback(enabled))
  },
  setMousePassthrough: (enabled: boolean) => ipcRenderer.invoke('mouse:passthrough', enabled),
  quit: () => ipcRenderer.invoke('app:quit')
}

contextBridge.exposeInMainWorld('desktop', api)
