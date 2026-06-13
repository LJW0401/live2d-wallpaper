import type { BrowserWindow } from 'electron'
import koffi from 'koffi'

const WM_SPAWN_WORKER = 0x052c
const SMTO_NORMAL = 0

const user32 = process.platform === 'win32' ? koffi.load('user32.dll') : null

const FindWindowW = user32?.func('void* __stdcall FindWindowW(str16 className, str16 windowName)')
const GetShellWindow = user32?.func('void* __stdcall GetShellWindow()')
const FindWindowExW = user32?.func(
  'void* __stdcall FindWindowExW(void* parent, void* childAfter, str16 className, str16 windowName)'
)
const SendMessageTimeoutW = user32?.func(
  'intptr_t __stdcall SendMessageTimeoutW(void* hwnd, uint msg, uintptr_t wParam, intptr_t lParam, uint flags, uint timeout, uintptr_t* result)'
)
const SetParent = user32?.func('void* __stdcall SetParent(void* child, void* newParent)')
const ShowWindow = user32?.func('bool __stdcall ShowWindow(void* hwnd, int command)')

function nativeHandle(window: BrowserWindow): bigint {
  const buffer = window.getNativeWindowHandle()
  return buffer.length === 8 ? buffer.readBigUInt64LE() : BigInt(buffer.readUInt32LE())
}

function findWorkerW(): unknown {
  if (!FindWindowW || !FindWindowExW || !SendMessageTimeoutW) return null

  const progman = FindWindowW('Progman', null) ?? GetShellWindow?.()
  if (!progman) return null

  const result = [0]
  SendMessageTimeoutW(progman, WM_SPAWN_WORKER, 0, 0, SMTO_NORMAL, 1000, result)

  let worker: unknown = null
  const progmanShellView = FindWindowExW(progman, null, 'SHELLDLL_DefView', null)
  if (progmanShellView) {
    worker = FindWindowExW(null, progman, 'WorkerW', null)
  }

  let current: unknown = null
  while (!worker && (current = FindWindowExW(null, current, 'WorkerW', null))) {
    const shellView = FindWindowExW(current, null, 'SHELLDLL_DefView', null)
    if (shellView) {
      worker = FindWindowExW(null, current, 'WorkerW', null)
      break
    }
  }

  return worker ?? progman
}

export function attachToDesktop(window: BrowserWindow): boolean {
  if (process.platform !== 'win32' || !SetParent) return false

  const worker = findWorkerW()
  if (!worker) return false

  SetParent(nativeHandle(window), worker)
  window.setBounds({
    x: 0,
    y: 0,
    width: window.getBounds().width,
    height: window.getBounds().height
  })
  window.setIgnoreMouseEvents(true, { forward: false })
  return true
}

export function detachFromDesktop(window: BrowserWindow): void {
  if (process.platform !== 'win32' || !SetParent || !ShowWindow) return
  SetParent(nativeHandle(window), null)
  ShowWindow(nativeHandle(window), 5)
  window.setIgnoreMouseEvents(false)
  window.show()
  window.focus()
}
