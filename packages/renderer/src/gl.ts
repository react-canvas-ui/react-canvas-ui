import { BatchRenderer, Renderer } from '@pixi/core'
import { InteractionManager } from '@pixi/interaction'
import { Prepare } from '@pixi/prepare'
import { skipHello } from '@pixi/utils'

let configureRenderer = () => {
  skipHello()
  Renderer.registerPlugin('interaction', InteractionManager)
  Renderer.registerPlugin('prepare', Prepare)
  Renderer.registerPlugin('batch', BatchRenderer)
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  configureRenderer = () => { }
}

export type MakeGlOptions = {
  surface: HTMLCanvasElement
  width: number
  height: number
  pixelRatio?: number
  antialias?: boolean
}

export const makeGl = ({
  surface,
  width,
  height,
  pixelRatio,
  antialias,
}: MakeGlOptions) => {
  configureRenderer()
  const gl = Renderer.create({
    view: surface,
    width,
    height,
    resolution: pixelRatio,
    autoDensity: true,
    antialias,
  })
  return gl
}
