import { useEffect, useRef, useState } from 'react'
import { ErrorBox, Note } from '../../components/ui'

// Escáner con la API nativa BarcodeDetector (Chrome/Edge en Android, Chrome en macOS). Safari/iOS no la
// implementa: en ese caso se informa y se usa la entrada manual del código.

interface Detector { detect(src: CanvasImageSource): Promise<{ rawValue: string }[]> }
type DetectorCtor = new (o: { formats: string[] }) => Detector
const Ctor = (globalThis as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector

export const scannerSupported = () => typeof Ctor === 'function' && !!navigator.mediaDevices?.getUserMedia

export function BarcodeScanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!scannerSupported()) return
    let stream: MediaStream | null = null
    let stop = false
    const detector = new Ctor!({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'] })
    ;(async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        if (!video.current) return
        video.current.srcObject = stream
        await video.current.play()
        while (!stop) {
          const found = await detector.detect(video.current).catch(() => [])
          const code = found.find((f) => /^\d{6,14}$/.test(f.rawValue))?.rawValue
          if (code) {
            navigator.vibrate?.(80)
            onCode(code)
            return
          }
          await new Promise((r) => setTimeout(r, 250))
        }
      } catch (e) {
        setError(e instanceof DOMException && e.name === 'NotAllowedError' ? 'Permiso de cámara denegado. Puedes escribir el código manualmente.' : 'No se pudo abrir la cámara.')
      }
    })()
    return () => {
      stop = true
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [onCode])

  if (!scannerSupported()) return <Note>Este navegador no permite escanear códigos (Safari/iOS no implementa BarcodeDetector). Escribe el código manualmente.</Note>
  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-xl bg-black">
        <video ref={video} playsInline muted className="aspect-video w-full object-cover" aria-label="Vista de la cámara" />
        <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-lime/80" />
      </div>
      {error && <ErrorBox>{error}</ErrorBox>}
      <p className="text-xs text-muted">Apunta al código de barras del empaque. La imagen no se guarda ni se envía.</p>
      <button className="btn-ghost w-full" onClick={onClose}>Cancelar</button>
    </div>
  )
}
