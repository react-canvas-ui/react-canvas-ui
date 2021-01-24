import { Sprite, Container, createElement, createPortal, Surface, Text, useCanvasState } from '@react-canvas-ui/core'
import { FC, useState } from 'react'
import BunnyImage from './assets/bunny.png'

export const HelloWorld: FC = () => {
  return (
    <Surface>
      <Container>
        <Sprite href={BunnyImage} x={100} y={100} />
        <Sprite href={BunnyImage} x={200} y={100} />
      </Container>
    </Surface>
  )
}

export const Portal: FC = () => {
  return (
    <Surface>
      <PortalContent />
    </Surface>
  )
}

const PortalContent: FC = () => {
  const { stage, height } = useCanvasState()
  const [portalContainer] = useState(() => {
    const container = createElement('Container')
    stage.addChild(container)
    return container
  })
  return (
    <Container y={height / 2}>
      <Text content='私はガラスを食べられます。それは私を傷つけません。' />
      { createPortal(<Text content='我能吞下玻璃而不伤身体。' />, portalContainer) }
    </Container>
  )
}

export default {
  title: 'renderer/Surface',
  component: Surface,
  decorators: [(Story: FC) => <div style={{ width: '100%', height: '100vh' }}><Story/></div>],
}