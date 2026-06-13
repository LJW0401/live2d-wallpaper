import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'

function copyMediaPipeAssets() {
  return {
    name: 'copy-mediapipe-assets',
    closeBundle() {
      const source = resolve('node_modules/@mediapipe/tasks-vision/wasm')
      const target = resolve('out/renderer/mediapipe/wasm')
      if (existsSync(source)) {
        mkdirSync(target, { recursive: true })
        cpSync(source, target, { recursive: true })
      }
    }
  }
}

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        external: ['koffi']
      }
    }
  },
  preload: {
    build: {
      rollupOptions: {
        output: {
          format: 'cjs',
          entryFileNames: 'index.js'
        }
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    plugins: [copyMediaPipeAssets()]
  }
})
