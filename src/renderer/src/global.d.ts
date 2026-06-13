import type { DesktopApi } from '../../shared/types'

declare global {
  interface Window {
    desktop: DesktopApi
    Live2DCubismCore?: unknown
  }
}

export {}
