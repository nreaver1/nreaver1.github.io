import { useState, useEffect } from 'react'
import { Download, X, Share, Plus } from 'lucide-react'

// Detect iOS Safari
function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream
}

// Detect standalone mode (already installed)
function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [showIOSHint,    setShowIOSHint]    = useState(false)
  const [dismissed,      setDismissed]      = useState(() => {
    return localStorage.getItem('kt_install_dismissed') === '1'
  })

  useEffect(() => {
    // Already installed — never show
    if (isStandalone() || dismissed) return

    // Chrome / Android — listen for install prompt
    const handler = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handler)

    // iOS Safari — show manual hint after a short delay
    if (isIOS() && !isStandalone()) {
      const timer = setTimeout(() => setShowIOSHint(true), 3000)
      return () => {
        clearTimeout(timer)
        window.removeEventListener('beforeinstallprompt', handler)
      }
    }

    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [dismissed])

  const dismiss = () => {
    setDismissed(true)
    setDeferredPrompt(null)
    setShowIOSHint(false)
    localStorage.setItem('kt_install_dismissed', '1')
  }

  const handleInstall = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      dismiss()
    } else {
      setDeferredPrompt(null)
    }
  }

  // Nothing to show
  if (dismissed || isStandalone()) return null
  if (!deferredPrompt && !showIOSHint) return null

  // iOS manual instructions
  if (showIOSHint) {
    return (
      <div className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-4 right-4 z-[150] animate-slide-up">
        <div className="bg-surface-2 border border-surface-4 rounded-2xl p-4 shadow-2xl">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 bg-brand-500/20 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
              <Download size={16} className="text-brand-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-600 text-sm">Add to Home Screen</p>
              <p className="text-white/40 text-xs mt-1 leading-relaxed">
                Tap <span className="inline-flex items-center gap-0.5 text-white/60"><Share size={11} /> Share</span> then{' '}
                <span className="inline-flex items-center gap-0.5 text-white/60"><Plus size={11} /> Add to Home Screen</span> for the full app experience.
              </p>
            </div>
            <button onClick={dismiss} className="text-white/20 hover:text-white/50 transition-colors shrink-0 mt-0.5">
              <X size={16} />
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Chrome / Android install prompt
  return (
    <div className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-4 right-4 z-[150] animate-slide-up">
      <div className="bg-surface-2 border border-brand-500/30 rounded-2xl p-4 shadow-2xl shadow-brand-500/10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-brand-500/20 rounded-xl flex items-center justify-center shrink-0">
            <Download size={16} className="text-brand-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-600 text-sm">Install Keep Track</p>
            <p className="text-white/40 text-xs mt-0.5">Add to your home screen for quick access</p>
          </div>
          <button onClick={dismiss} className="text-white/20 hover:text-white/50 transition-colors shrink-0">
            <X size={16} />
          </button>
        </div>
        <div className="flex gap-2 mt-3">
          <button onClick={dismiss} className="btn-ghost btn-sm flex-1 text-white/40">Not now</button>
          <button onClick={handleInstall} className="btn-primary btn-sm flex-1">
            <Download size={13} /> Install
          </button>
        </div>
      </div>
    </div>
  )
}
