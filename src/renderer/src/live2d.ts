import { ShaderSystem } from '@pixi/core'
import { install } from '@pixi/unsafe-eval'
import { Application, Ticker } from 'pixi.js'
import type { Live2DModel } from 'pixi-live2d-display/cubism4'
import type { TrackingFrame } from './tracker'

install({ ShaderSystem })

interface CubismCoreModel {
  setParameterValueById(id: string, value: number): void
}

export class Live2DStage {
  private app: Application
  private model: Live2DModel | null = null
  private trackingActive = false
  private trackingStrength = 1
  private position = { x: 0.5, y: 1, scale: 0.35 }
  private current: TrackingFrame = {
    yaw: 0,
    pitch: 0,
    roll: 0,
    eyeLeft: 1,
    eyeRight: 1,
    mouthOpen: 0
  }

  constructor(canvasHost: HTMLElement) {
    this.app = new Application({
      resizeTo: window,
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(devicePixelRatio, 2)
    })
    canvasHost.appendChild(this.app.view as HTMLCanvasElement)
    window.addEventListener('resize', () => this.layout())
  }

  async load(url: string): Promise<void> {
    if (!window.Live2DCubismCore) {
      throw new Error('缺少 Cubism 4 Core，请按 README 放置运行库文件。')
    }

    const { Live2DModel } = await import('pixi-live2d-display/cubism4')
    Live2DModel.registerTicker(Ticker)
    if (this.model) {
      this.app.stage.removeChild(this.model)
      this.model.destroy({ children: true })
    }
    this.model = await Live2DModel.from(url, { autoInteract: false })
    this.model.anchor.set(0.5, 1)
    this.model.internalModel.on('beforeModelUpdate', () => this.writeTrackingParameters())
    this.app.stage.addChild(this.model)
    this.layout()
  }

  setLayout(x: number, y: number, scale: number): void {
    this.position = { x, y, scale }
    this.layout()
  }

  applyTracking(frame: TrackingFrame, smoothing: number, strength: number): void {
    if (!this.model) return
    const alpha = Math.max(0.02, Math.min(1, smoothing))
    for (const key of Object.keys(frame) as Array<keyof TrackingFrame>) {
      this.current[key] += (frame[key] - this.current[key]) * alpha
    }
    this.trackingStrength = strength
  }

  setTrackingActive(active: boolean): void {
    this.trackingActive = active
  }

  private writeTrackingParameters(): void {
    if (!this.model || !this.trackingActive) return
    const core = this.model.internalModel.coreModel as CubismCoreModel
    const set = (id: string, value: number) => core.setParameterValueById(id, value)
    set('ParamAngleX', this.current.yaw * this.trackingStrength)
    set('ParamAngleY', -this.current.pitch * this.trackingStrength)
    set('ParamAngleZ', this.current.roll * this.trackingStrength)
    set('ParamBodyAngleX', this.current.yaw * 0.35 * this.trackingStrength)
    set('ParamEyeBallX', (this.current.yaw / 30) * this.trackingStrength)
    set('ParamEyeBallY', (-this.current.pitch / 30) * this.trackingStrength)
    set('ParamEyeLOpen', this.current.eyeLeft)
    set('ParamEyeROpen', this.current.eyeRight)
    set('ParamMouthOpenY', this.current.mouthOpen)
  }

  private layout(): void {
    if (!this.model) return
    const base = Math.min(window.innerWidth, window.innerHeight)
    const natural = Math.max(this.model.width, this.model.height)
    const scale = natural > 0 ? (base * this.position.scale) / natural : 1
    this.model.scale.set(scale)
    this.model.position.set(
      window.innerWidth * this.position.x,
      window.innerHeight * this.position.y
    )
  }
}
