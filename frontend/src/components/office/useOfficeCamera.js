import { useState, useCallback, useRef, useEffect } from 'react'

const ZOOM_MIN = 0.4
const ZOOM_MAX = 2.0
const ZOOM_DEFAULT = 0.75
const ZOOM_SPEED = 0.001
const DRAG_THRESHOLD = 4

export function useOfficeCamera() {
  const [zoom, setZoom] = useState(ZOOM_DEFAULT)
  const [panX, setPanX] = useState(0)
  const [panY, setPanY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const dragRef = useRef({ active: false, moved: false, startX: 0, startY: 0, startPanX: 0, startPanY: 0 })
  const didDragRef = useRef(false)
  const panRef = useRef({ x: 0, y: 0 })
  const viewportRef = useRef(null)

  // Attach wheel listener with { passive: false } so preventDefault works
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const handleWheel = (e) => {
      e.preventDefault()
      setZoom(z => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z - e.deltaY * ZOOM_SPEED)))
    }
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [])

  useEffect(() => { panRef.current = { x: panX, y: panY } }, [panX, panY])

  const onPointerDown = useCallback((e) => {
    if (e.button !== 0) return
    dragRef.current = { active: true, moved: false, startX: e.clientX, startY: e.clientY, startPanX: panRef.current.x, startPanY: panRef.current.y }
    didDragRef.current = false
    e.currentTarget.setPointerCapture(e.pointerId)
  }, [])

  const onPointerMove = useCallback((e) => {
    if (!dragRef.current.active) return
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    if (!dragRef.current.moved && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
      dragRef.current.moved = true
      setIsDragging(true)
    }
    if (dragRef.current.moved) {
      setPanX(dragRef.current.startPanX + dx)
      setPanY(dragRef.current.startPanY + dy)
    }
  }, [])

  const onPointerUp = useCallback(() => {
    if (dragRef.current.moved) {
      didDragRef.current = true
      // Clear after a tick so click handlers can check it
      setTimeout(() => { didDragRef.current = false }, 0)
    }
    dragRef.current.active = false
    dragRef.current.moved = false
    setIsDragging(false)
  }, [])

  const reset = useCallback(() => {
    setZoom(ZOOM_DEFAULT)
    setPanX(0)
    setPanY(0)
  }, [])

  // Used by click handlers to check if a drag just ended
  const wasDragging = useCallback(() => didDragRef.current, [])

  return {
    zoom, panX, panY, isDragging, reset, viewportRef, wasDragging,
    handlers: { onPointerDown, onPointerMove, onPointerUp },
  }
}
