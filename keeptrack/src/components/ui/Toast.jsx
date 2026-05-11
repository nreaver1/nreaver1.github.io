import { create } from 'zustand'
import { useEffect, useRef } from 'react'
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react'

// ── Toast store ──────────────────────────────────────────────
export const useToastStore = create((set) => ({
  toasts: [],

  add: (toast) => {
    const id = crypto.randomUUID()
    set(s => ({ toasts: [...s.toasts, { id, ...toast }] }))
    return id
  },

  remove: (id) => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),

  clear: () => set({ toasts: [] }),
}))

// ── Convenience hook ─────────────────────────────────────────
export function useToast() {
  const { add, remove } = useToastStore()

  return {
    success: (message, duration = 3500) => add({ type: 'success', message, duration }),
    error:   (message, duration = 5000) => add({ type: 'error',   message, duration }),
    warning: (message, duration = 4000) => add({ type: 'warning', message, duration }),
    info:    (message, duration = 3500) => add({ type: 'info',    message, duration }),
  }
}

// ── Single toast item ─────────────────────────────────────────
const CONFIGS = {
  success: { icon: CheckCircle, bg: 'bg-emerald-500/15 border-emerald-500/30', text: 'text-emerald-400', icon_c: 'text-emerald-400' },
  error:   { icon: XCircle,     bg: 'bg-red-500/15 border-red-500/30',         text: 'text-red-300',    icon_c: 'text-red-400'     },
  warning: { icon: AlertCircle, bg: 'bg-yellow-500/15 border-yellow-500/30',   text: 'text-yellow-300', icon_c: 'text-yellow-400'  },
  info:    { icon: Info,        bg: 'bg-brand-500/15 border-brand-500/30',     text: 'text-brand-300',  icon_c: 'text-brand-400'   },
}

function ToastItem({ toast }) {
  const remove   = useToastStore(s => s.remove)
  const timerRef = useRef(null)
  const cfg      = CONFIGS[toast.type] ?? CONFIGS.info
  const Icon     = cfg.icon

  useEffect(() => {
    timerRef.current = setTimeout(() => remove(toast.id), toast.duration ?? 3500)
    return () => clearTimeout(timerRef.current)
  }, [toast.id])

  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 rounded-2xl border backdrop-blur-sm shadow-xl
        ${cfg.bg} animate-slide-up max-w-sm w-full`}
    >
      <Icon size={16} className={`${cfg.icon_c} shrink-0 mt-0.5`} />
      <p className={`flex-1 text-sm font-600 leading-snug ${cfg.text}`}>{toast.message}</p>
      <button
        onClick={() => remove(toast.id)}
        className="text-white/30 hover:text-white/60 transition-colors shrink-0 mt-0.5"
      >
        <X size={14} />
      </button>
    </div>
  )
}

// ── Toast container — top on desktop, bottom on mobile ───────
export function ToastContainer() {
  const toasts = useToastStore(s => s.toasts)
  if (!toasts.length) return null

  return (
    <>
      {/* Mobile — bottom, above tab bar */}
      <div className="lg:hidden fixed bottom-20 left-0 right-0 z-[100] flex flex-col gap-2 items-center px-4 pointer-events-none">
        {[...toasts].reverse().map(t => (
          <div key={t.id} className="pointer-events-auto w-full max-w-sm">
            <ToastItem toast={t} />
          </div>
        ))}
      </div>

      {/* Desktop — top right */}
      <div className="hidden lg:flex fixed top-4 right-4 z-[100] flex-col gap-2 items-end pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className="pointer-events-auto">
            <ToastItem toast={t} />
          </div>
        ))}
      </div>
    </>
  )
}
