import { useState, useRef } from 'react'
import { Camera, Upload, X, Loader } from 'lucide-react'
import { supabase } from '../../lib/supabase'

// ── Compress image to max 400px and convert to webp ──────────
async function compressImage(file, maxSize = 400) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale  = Math.min(1, maxSize / Math.max(img.width, img.height))
      const width  = Math.round(img.width  * scale)
      const height = Math.round(img.height * scale)

      const canvas = document.createElement('canvas')
      canvas.width  = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob(blob => {
        if (!blob) { reject(new Error('Compression failed')); return }
        resolve(blob)
      }, 'image/webp', 0.85)
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image')) }
    img.src = url
  })
}

export default function AvatarUpload({ userId, currentUrl, username, onUpload }) {
  const [preview,   setPreview]   = useState(null)
  const [uploading, setUploading] = useState(false)
  const [error,     setError]     = useState('')
  const fileRef = useRef(null)

  const initials = username?.[0]?.toUpperCase() ?? '?'

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')

    // Validate type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file.')
      return
    }
    // Validate size (before compression — warn if > 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setError('Image is too large. Please choose a file under 10MB.')
      return
    }

    // Show preview immediately
    const reader = new FileReader()
    reader.onload = e => setPreview(e.target.result)
    reader.readAsDataURL(file)

    // Compress and upload
    setUploading(true)
    try {
      const compressed = await compressImage(file, 400)
      const ext        = 'webp'
      const path       = `${userId}/avatar.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, compressed, {
          contentType: 'image/webp',
          upsert: true,  // replace existing
        })

      if (uploadError) {
        setError('Upload failed. Please try again.')
        setPreview(null)
        setUploading(false)
        return
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(path)

      // Add cache-bust so browser re-fetches the new image
      const urlWithBust = `${publicUrl}?t=${Date.now()}`
      onUpload(urlWithBust)
      setPreview(null)
    } catch (err) {
      setError('Something went wrong. Please try again.')
      setPreview(null)
    }
    setUploading(false)
  }

  const handleRemove = () => {
    onUpload(null)
    setPreview(null)
    setError('')
    if (fileRef.current) fileRef.current.value = ''
  }

  const displayUrl = preview ?? currentUrl

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Avatar preview */}
      <div className="relative group">
        <div className="w-24 h-24 rounded-2xl overflow-hidden border-2 border-surface-4">
          {displayUrl ? (
            <img
              src={displayUrl}
              alt={username}
              className="w-full h-full object-cover"
              onError={e => { e.target.style.display = 'none' }}
            />
          ) : (
            <div className="w-full h-full bg-brand-500/20 flex items-center justify-center">
              <span className="font-display text-4xl text-brand-400">{initials}</span>
            </div>
          )}
        </div>

        {/* Upload overlay */}
        {!uploading && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="absolute inset-0 rounded-2xl bg-black/50 flex items-center justify-center
              opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
          >
            <Camera size={22} className="text-white" />
          </button>
        )}

        {/* Uploading spinner overlay */}
        {uploading && (
          <div className="absolute inset-0 rounded-2xl bg-black/60 flex items-center justify-center">
            <Loader size={22} className="text-white animate-spin" />
          </div>
        )}
      </div>

      {/* Buttons */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="btn-secondary btn-sm"
          disabled={uploading}
        >
          {uploading
            ? <><Loader size={13} className="animate-spin" /> Uploading...</>
            : <><Upload size={13} /> {currentUrl ? 'Change Photo' : 'Upload Photo'}</>
          }
        </button>
        {(currentUrl || preview) && !uploading && (
          <button
            type="button"
            onClick={handleRemove}
            className="btn-ghost btn-sm text-red-400 hover:text-red-300"
          >
            <X size={13} /> Remove
          </button>
        )}
      </div>

      {error && <p className="input-error text-center">{error}</p>}

      <p className="text-white/20 text-xs text-center">
        JPG, PNG, or WebP · Max 2MB · Auto-resized to 400px
      </p>

      {/* Hidden file input */}
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  )
}
