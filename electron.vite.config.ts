import { cpSync, createReadStream, existsSync, mkdirSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import type { ViteDevServer } from 'vite'

function copyMediaPipeAssets() {
  const source = resolve('node_modules/@mediapipe/tasks-vision/wasm')

  return {
    name: 'copy-mediapipe-assets',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/mediapipe/wasm', (request, response, next) => {
        const requested = decodeURIComponent(request.url?.split('?')[0] ?? '').replace(
          /^[/\\]+/,
          ''
        )
        const file = resolve(source, requested)
        if (relative(source, file).startsWith('..') || !existsSync(file)) {
          next()
          return
        }

        response.setHeader(
          'Content-Type',
          file.endsWith('.wasm') ? 'application/wasm' : 'text/javascript; charset=utf-8'
        )
        createReadStream(file).pipe(response)
      })
    },
    closeBundle() {
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
