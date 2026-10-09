interface GestureEvent extends UIEvent {
  readonly scale: number
  readonly clientX: number
  readonly clientY: number
}

interface SVGSVGElementEventMap {
  gesturestart: GestureEvent
  gesturechange: GestureEvent
  gestureend: GestureEvent
}
