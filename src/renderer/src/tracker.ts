import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult
} from '@mediapipe/tasks-vision'

export interface TrackingFrame {
  yaw: number
  pitch: number
  roll: number
  eyeLeft: number
  eyeRight: number
  mouthOpen: number
}

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'

export class HeadTracker {
  private landmarker: FaceLandmarker | null = null
  private stream: MediaStream | null = null
  private animation = 0
  private lastVideoTime = -1

  async start(
    video: HTMLVideoElement,
    cameraId: string | null,
    onFrame: (frame: TrackingFrame) => void
  ): Promise<void> {
    this.stop()
    const vision = await FilesetResolver.forVisionTasks('/mediapipe/wasm')
    try {
      this.landmarker = await this.createLandmarker(vision, 'GPU')
    } catch {
      this.landmarker = await this.createLandmarker(vision, 'CPU')
    }

    this.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        deviceId: cameraId ? { exact: cameraId } : undefined,
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 30 }
      },
      audio: false
    })
    video.srcObject = this.stream
    await video.play()

    const tick = () => {
      if (!this.landmarker || !this.stream) return
      if (video.currentTime !== this.lastVideoTime) {
        this.lastVideoTime = video.currentTime
        const result = this.landmarker.detectForVideo(video, performance.now())
        const frame = this.toTrackingFrame(result)
        if (frame) onFrame(frame)
      }
      this.animation = requestAnimationFrame(tick)
    }
    tick()
  }

  private createLandmarker(
    vision: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>,
    delegate: 'GPU' | 'CPU'
  ): Promise<FaceLandmarker> {
    return FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: MODEL_URL,
        delegate
      },
      runningMode: 'VIDEO',
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
      numFaces: 1
    })
  }

  stop(): void {
    cancelAnimationFrame(this.animation)
    this.stream?.getTracks().forEach((track) => track.stop())
    this.stream = null
    this.landmarker?.close()
    this.landmarker = null
  }

  private toTrackingFrame(result: FaceLandmarkerResult): TrackingFrame | null {
    const matrix = result.facialTransformationMatrixes[0]?.data
    const shapes = result.faceBlendshapes[0]?.categories
    if (!matrix || !shapes) return null

    const score = (name: string) =>
      shapes.find((shape) => shape.categoryName === name)?.score ?? 0

    const pitch = Math.atan2(-matrix[9], matrix[10])
    const yaw = Math.asin(Math.max(-1, Math.min(1, matrix[8])))
    const roll = Math.atan2(-matrix[4], matrix[0])

    return {
      yaw: yaw * (180 / Math.PI),
      pitch: pitch * (180 / Math.PI),
      roll: roll * (180 / Math.PI),
      eyeLeft: 1 - score('eyeBlinkLeft'),
      eyeRight: 1 - score('eyeBlinkRight'),
      mouthOpen: score('jawOpen')
    }
  }
}
