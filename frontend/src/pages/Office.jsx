import { useState, useCallback } from 'react'
import { OfficeCss } from './OfficeCss'

export function Office() {
  const [iframeError, setIframeError] = useState(false)

  const handleIframeError = useCallback(() => {
    setIframeError(true)
  }, [])

  // If Claw3D iframe fails to load, fall back to CSS 3D
  if (iframeError) {
    return <OfficeCss />
  }

  return (
    <div className="h-[calc(100vh-80px)] relative bg-[#08080e]">
      {/* Loading state shown while iframe loads */}
      <div className="absolute inset-0 flex items-center justify-center z-0">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/10 border-t-white/40" />
          <p className="text-[11px] text-white/30" style={{ fontFamily: '"JetBrains Mono", monospace' }}>
            Loading 3D Office...
          </p>
        </div>
      </div>

      {/* Claw3D iframe — proxied through same origin */}
      <iframe
        src="/claw3d/office"
        className="relative z-10 w-full h-full border-0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; webgl"
        onError={handleIframeError}
        title="3D Office"
      />
    </div>
  )
}
