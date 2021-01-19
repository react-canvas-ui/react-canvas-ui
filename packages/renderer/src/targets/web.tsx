import { memo, MutableRefObject, ReactNode, useLayoutEffect, useMemo, useRef, useState } from 'react'
import useMeasure, { RectReadOnly } from 'react-use-measure'
import { useCanvas, UseCanvasOptions } from '../canvas'
import { makeGl, MakeGlOptions } from '../gl'

const defaultStyles: React.CSSProperties = {
  position: 'relative',
  width: '100%',
  height: '100%',
  overflow: 'hidden',
}

type CanvasProps = React.HTMLAttributes<HTMLDivElement>

export const Canvas = memo(({
  style,
  children,
  ...wrapperProps
}: CanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>()
  const [bind, rect] = useMeasure({ scroll: true, debounce: { scroll: 50, resize: 0 }})
  const pixelRatio = usePixelRatio()
  const ready = useReady(rect)
  
  const initGl = ready && canvasRef.current && (
    <InitGl
      surface={ canvasRef.current }
      top={ rect.top }
      left={ rect.left }
      width={ rect.width }
      height={ rect.height }
      pixelRatio={ pixelRatio }
    >
      { children }
    </InitGl>
  )

  return (
    <div ref={ bind } style={{ ...defaultStyles, ...style }} {...wrapperProps}>
      <canvas ref={ canvasRef as MutableRefObject<HTMLCanvasElement> } style={{ display: 'block' }} />
      { initGl }
    </div>
  )
})

type InitGlProps = MakeGlOptions & Pick<UseCanvasOptions, 'children' | 'top' | 'left'>

const InitGl = ({
  surface,
  top,
  left,
  width,
  height,
  pixelRatio,
  children,
}: InitGlProps) => {
  const [gl] = useState(() => {
    return makeGl({
      surface,
      width,
      height,
      pixelRatio,
      antialias: true, // default aa enabled
    })
  })
  useCanvas({
    gl,
    top,
    left,
    width, 
    height, 
    children
  })
  useLayoutEffect(() => () => {
    gl.destroy()
  }, [gl])
  return null
}

const useReady = (rect: Pick<RectReadOnly, 'width' | 'height'>) => {
  const flag = useRef(false)
  const ready = useMemo(() => (flag.current = flag.current || (!!rect.width && !!rect.height)), [rect])
  return ready
}

const usePixelRatio = () => {
  // TODO listen devicePixelRatio changes
  return window.devicePixelRatio
}
