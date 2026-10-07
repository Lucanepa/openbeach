import { useRef, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal as KitModal, modalCancelClass, modalPrimaryClass, modalSaveClass } from '../ui/volleyui/Modal.jsx'
import { FOCUS_RING } from '../ui/volleyui/Button.jsx'
import { cn } from '../ui/volleyui/cn.js'

export default function SignaturePad({ open, onClose, onSave, title, existingSignature = null, readOnly = false }) {
  const { t } = useTranslation()
  const canvasRef = useRef(null)
  const isDrawingRef = useRef(false)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasSignature, setHasSignature] = useState(false)

  useEffect(() => {
    if (!open) {
      setHasSignature(false)
      return
    }

    let cleanup = null
    let timerId = null

    // Wait for modal to render before sizing canvas
    timerId = setTimeout(() => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')

      // Set canvas size based on container
      const rect = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr

      // Scale context to match device pixel ratio
      ctx.scale(dpr, dpr)

      // Set drawing style
      ctx.strokeStyle = '#000000' // Black strokes
      ctx.lineWidth = 4 // Thicker lines for better visibility in PDF
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'

      // Load existing signature if provided, otherwise clear canvas
      if (existingSignature) {
        const img = new Image()
        img.onload = () => {
          // Draw the existing signature to fill the canvas
          // Note: ctx is already scaled by dpr, so we draw at the display size
          ctx.drawImage(img, 0, 0, rect.width, rect.height)
          setHasSignature(true)
        }
        img.onerror = () => {
          // If image fails to load, clear canvas
          ctx.clearRect(0, 0, rect.width, rect.height)
          setHasSignature(false)
        }
        img.src = existingSignature
      } else {
        // Clear canvas (transparent background)
        ctx.clearRect(0, 0, rect.width, rect.height)
        setHasSignature(false)
      }

      // Add touch event listeners with passive: false to allow preventDefault
      const getPointForTouch = (e) => {
        const rect = canvas.getBoundingClientRect()
        if (e.touches && e.touches.length > 0) {
          return {
            x: e.touches[0].clientX - rect.left,
            y: e.touches[0].clientY - rect.top
          }
        }
        return {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top
        }
      }

      const touchStartHandler = (e) => {
        e.preventDefault()
        isDrawingRef.current = true
        setIsDrawing(true)
        const point = getPointForTouch(e)
        ctx.beginPath()
        ctx.moveTo(point.x, point.y)
      }
      const touchMoveHandler = (e) => {
        if (!isDrawingRef.current) return
        e.preventDefault()
        const point = getPointForTouch(e)
        ctx.lineTo(point.x, point.y)
        ctx.stroke()
        setHasSignature(true)
      }
      const touchEndHandler = (e) => {
        e.preventDefault()
        isDrawingRef.current = false
        setIsDrawing(false)
      }

      // Only add drawing event listeners if not read-only
      if (!readOnly) {
        canvas.addEventListener('touchstart', touchStartHandler, { passive: false })
        canvas.addEventListener('touchmove', touchMoveHandler, { passive: false })
        canvas.addEventListener('touchend', touchEndHandler, { passive: false })

        cleanup = () => {
          canvas.removeEventListener('touchstart', touchStartHandler)
          canvas.removeEventListener('touchmove', touchMoveHandler)
          canvas.removeEventListener('touchend', touchEndHandler)
        }
      }
    }, 100)

    return () => {
      if (timerId) clearTimeout(timerId)
      if (cleanup) cleanup()
    }
  }, [open, existingSignature, readOnly])

  function getPoint(e) {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    if (e.touches && e.touches.length > 0) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top
      }
    }
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    }
  }

  function startDrawing(e) {
    e.preventDefault()
    isDrawingRef.current = true
    setIsDrawing(true)
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const point = getPoint(e)
    ctx.beginPath()
    ctx.moveTo(point.x, point.y)
  }

  function draw(e) {
    if (!isDrawingRef.current) return
    e.preventDefault()
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const point = getPoint(e)
    ctx.lineTo(point.x, point.y)
    ctx.stroke()
    setHasSignature(true)
  }

  function stopDrawing(e) {
    e.preventDefault()
    isDrawingRef.current = false
    setIsDrawing(false)
  }

  function clear() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const rect = canvas.getBoundingClientRect()
    // Clear canvas (transparent)
    ctx.clearRect(0, 0, rect.width, rect.height)
    setHasSignature(false)
  }

  function save() {
    const canvas = canvasRef.current
    if (!canvas || !hasSignature) return
    const dataURL = canvas.toDataURL('image/png')
    onSave(dataURL)
    onClose()
  }

  function handleCancel() {
    // Just close without saving - don't clear existing signature
    onClose()
  }

  // volleyui decision dialog (above the legacy header like the modal it
  // replaces; a backdrop tap does not close it, so a stroke near the edge
  // cannot lose the signature). The pad itself stays white with black ink.
  if (!open) return null
  return (
    <div className="ov-kit" style={{ position: 'relative', zIndex: 1000 }}>
      <KitModal
        open
        decision
        dismissible={false}
        size="xl"
        title={title}
        onClose={onClose}
        closeLabel={t('signature.close')}
        footer={readOnly ? (
          <button type="button" onClick={onClose} className={cn(modalPrimaryClass, 'min-h-11')}>{t('signature.close')}</button>
        ) : (
          <>
            <button type="button" onClick={clear} className={cn('mr-auto inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-stone-600 underline-offset-2 hover:underline', FOCUS_RING)}>{t('signature.clear')}</button>
            <button type="button" onClick={handleCancel} className={cn(modalCancelClass, 'min-h-11')}>{t('signature.cancel')}</button>
            <button type="button" onClick={save} disabled={!hasSignature} className={cn(modalSaveClass, 'min-h-11 disabled:cursor-not-allowed disabled:bg-stone-300')}>{t('signature.save')}</button>
          </>
        )}
      >
        <div className="relative overflow-hidden rounded-xl border-2 border-dashed border-stone-300 bg-white" style={{ touchAction: 'none' }}>
          <canvas
            ref={canvasRef}
            style={{
              width: '100%',
              height: '200px',
              display: 'block',
              cursor: readOnly ? 'default' : 'crosshair',
              background: '#ffffff'
            }}
            onMouseDown={readOnly ? undefined : startDrawing}
            onMouseMove={readOnly ? undefined : draw}
            onMouseUp={readOnly ? undefined : stopDrawing}
            onMouseLeave={readOnly ? undefined : stopDrawing}
          />
        </div>
      </KitModal>
    </div>
  )
}
