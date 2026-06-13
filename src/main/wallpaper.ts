import type { BrowserWindow } from 'electron'
import koffi from 'koffi'

const WM_SPAWN_WORKER = 0x052c
const SMTO_NORMAL = 0
const GWL_STYLE = -16
const GWL_EXSTYLE = -20
const WS_CHILD = 0x40000000n
const WS_POPUP = 0x80000000n
const WS_EX_LAYERED = 0x00080000n
const WS_EX_NOREDIRECTIONBITMAP = 0x00200000n
const LWA_ALPHA = 0x00000002
const HWND_TOP = 0
const HWND_BOTTOM = 1
const SWP_NOMOVE = 0x0002
const SWP_NOSIZE = 0x0001
const SWP_NOACTIVATE = 0x0010
const SWP_FRAMECHANGED = 0x0020
const SWP_SHOWWINDOW = 0x0040

const user32 = process.platform === 'win32' ? koffi.load('user32.dll') : null

const FindWindowW = user32?.func('void* __stdcall FindWindowW(str16 className, str16 windowName)')
const GetShellWindow = user32?.func('void* __stdcall GetShellWindow()')
const GetParent = user32?.func('void* __stdcall GetParent(void* hwnd)')
const FindWindowExW = user32?.func(
  'void* __stdcall FindWindowExW(void* parent, void* childAfter, str16 className, str16 windowName)'
)
const SendMessageTimeoutW = user32?.func(
  'intptr_t __stdcall SendMessageTimeoutW(void* hwnd, uint msg, uintptr_t wParam, intptr_t lParam, uint flags, uint timeout, uintptr_t* result)'
)
const SetParent = user32?.func('void* __stdcall SetParent(void* child, void* newParent)')
const GetWindowLongPtrW = user32?.func(
  'intptr_t __stdcall GetWindowLongPtrW(void* hwnd, int index)'
)
const SetWindowLongPtrW = user32?.func(
  'intptr_t __stdcall SetWindowLongPtrW(void* hwnd, int index, intptr_t value)'
)
const SetWindowPos = user32?.func(
  'bool __stdcall SetWindowPos(void* hwnd, void* insertAfter, int x, int y, int width, int height, uint flags)'
)
const SetLayeredWindowAttributes = user32?.func(
  'bool __stdcall SetLayeredWindowAttributes(void* hwnd, uint colorKey, uchar alpha, uint flags)'
)
const ShowWindow = user32?.func('bool __stdcall ShowWindow(void* hwnd, int command)')

interface WallpaperState {
  parent: unknown
  style: bigint
  exStyle: bigint
  bounds: Electron.Rectangle
}

interface DesktopLayer {
  host: unknown
  insertAfter: unknown
  backgroundWorker: unknown
  raised: boolean
}

const states = new WeakMap<BrowserWindow, WallpaperState>()

function nativeHandle(window: BrowserWindow): bigint {
  const buffer = window.getNativeWindowHandle()
  return buffer.length === 8 ? buffer.readBigUInt64LE() : BigInt(buffer.readUInt32LE())
}

function findDesktopLayer(): DesktopLayer | null {
  if (
    !FindWindowW ||
    !FindWindowExW ||
    !SendMessageTimeoutW ||
    !GetWindowLongPtrW
  ) {
    return null
  }

  const progman = FindWindowW('Progman', null) ?? GetShellWindow?.()
  if (!progman) return null

  const result = [0]
  SendMessageTimeoutW(progman, WM_SPAWN_WORKER, 0x0d, 1, SMTO_NORMAL, 1000, result)

  const progmanShellView = FindWindowExW(progman, null, 'SHELLDLL_DefView', null)
  const progmanExStyle = BigInt(GetWindowLongPtrW(progman, GWL_EXSTYLE))
  const raised = (progmanExStyle & WS_EX_NOREDIRECTIONBITMAP) !== 0n
  if (raised && progmanShellView) {
    return {
      host: progman,
      insertAfter: progmanShellView,
      backgroundWorker: FindWindowExW(progman, null, 'WorkerW', null),
      raised: true
    }
  }

  let current: unknown = null
  while ((current = FindWindowExW(null, current, 'WorkerW', null))) {
    const shellView = FindWindowExW(current, null, 'SHELLDLL_DefView', null)
    if (shellView) {
      const worker = FindWindowExW(null, current, 'WorkerW', null)
      if (worker) {
        return {
          host: worker,
          insertAfter: HWND_BOTTOM,
          backgroundWorker: null,
          raised: false
        }
      }
    }
  }

  if (!progmanShellView) return null
  return {
    host: progman,
    insertAfter: progmanShellView,
    backgroundWorker: null,
    raised: true
  }
}

export function attachToDesktop(window: BrowserWindow, bounds: Electron.Rectangle): boolean {
  if (
    process.platform !== 'win32' ||
    !SetParent ||
    !GetParent ||
    !GetWindowLongPtrW ||
    !SetWindowLongPtrW ||
    !SetWindowPos ||
    !SetLayeredWindowAttributes
  ) {
    return false
  }
  if (states.has(window)) return true

  const desktop = findDesktopLayer()
  if (!desktop) return false

  const hwnd = nativeHandle(window)
  const originalBounds = window.getBounds()
  const style = BigInt(GetWindowLongPtrW(hwnd, GWL_STYLE))
  const exStyle = BigInt(GetWindowLongPtrW(hwnd, GWL_EXSTYLE))
  states.set(window, {
    parent: GetParent(hwnd),
    style,
    exStyle,
    bounds: originalBounds
  })

  SetWindowLongPtrW(hwnd, GWL_STYLE, (style & ~WS_POPUP) | WS_CHILD)
  if (desktop.raised) {
    SetWindowLongPtrW(hwnd, GWL_EXSTYLE, exStyle | WS_EX_LAYERED)
    SetLayeredWindowAttributes(hwnd, 0, 255, LWA_ALPHA)
  }
  SetParent(hwnd, desktop.host)
  const parent = GetParent(hwnd)
  const positioned = SetWindowPos(
    hwnd,
    desktop.insertAfter,
    0,
    0,
    bounds.width,
    bounds.height,
    SWP_NOACTIVATE | SWP_FRAMECHANGED | SWP_SHOWWINDOW
  )
  if (desktop.backgroundWorker) {
    SetWindowPos(
      desktop.backgroundWorker,
      HWND_BOTTOM,
      0,
      0,
      0,
      0,
      SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE
    )
  }
  if (!parent || !positioned) {
    detachFromDesktop(window)
    return false
  }

  window.setIgnoreMouseEvents(true, { forward: false })
  window.setSkipTaskbar(true)
  return true
}

export function detachFromDesktop(window: BrowserWindow): void {
  if (
    process.platform !== 'win32' ||
    !SetParent ||
    !SetWindowLongPtrW ||
    !SetWindowPos ||
    !ShowWindow
  ) {
    return
  }

  const state = states.get(window)
  const hwnd = nativeHandle(window)
  SetParent(hwnd, state?.parent ?? null)
  if (state) {
    SetWindowLongPtrW(hwnd, GWL_STYLE, state.style)
    SetWindowLongPtrW(hwnd, GWL_EXSTYLE, state.exStyle)
  }
  const bounds = state?.bounds ?? window.getBounds()
  SetWindowPos(
    hwnd,
    HWND_TOP,
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
    SWP_FRAMECHANGED | SWP_SHOWWINDOW
  )
  states.delete(window)
  window.setIgnoreMouseEvents(false)
  window.setSkipTaskbar(false)
  window.show()
  window.moveTop()
  window.focus()
}
