import { Trophy } from 'lucide-react'

// Games nav tab now redirects to /stats via App.jsx
// This is kept only as a safety fallback
export function GamesPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-4 text-center">
      <Trophy size={32} className="text-white/10 mb-3" />
      <p className="text-white/40 text-sm">Redirecting to Stats...</p>
    </div>
  )
}
