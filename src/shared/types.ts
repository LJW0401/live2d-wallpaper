export interface AppSettings {
  modelUrl: string | null
  modelPath: string | null
  modelName: string | null
  scale: number
  x: number
  y: number
  trackingEnabled: boolean
  cameraId: string | null
  mirrorCamera: boolean
  smoothing: number
  trackingStrength: number
  wallpaperMode: boolean
}

export interface DesktopApi {
  getSettings(): Promise<AppSettings>
  saveSettings(settings: Partial<AppSettings>): Promise<AppSettings>
  chooseModel(): Promise<{ url: string; name: string } | null>
  setWallpaperMode(enabled: boolean): Promise<boolean>
  onWallpaperModeChanged(callback: (enabled: boolean) => void): void
  setMousePassthrough(enabled: boolean): Promise<void>
  quit(): Promise<void>
}
