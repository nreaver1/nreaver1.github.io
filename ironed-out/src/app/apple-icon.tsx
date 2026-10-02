import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

/** Home-screen icon (iOS wants a PNG): the same flag-on-the-green mark as icon.svg. */
export default function AppleIcon() {
  return new ImageResponse(
    <div style={{ width: 180, height: 180, display: 'flex', background: '#FBF6E9' }}>
      <svg width="180" height="180" viewBox="0 0 64 64">
        <path
          d="M0 46 Q20 38 34 43 T64 40 L64 64 L0 64 Z"
          fill="#6FA35F"
          stroke="#2B2A26"
          strokeWidth="2.5"
        />
        <ellipse cx="38" cy="45" rx="12" ry="3.5" fill="#4E8B4A" stroke="#2B2A26" strokeWidth="2" />
        <ellipse cx="39" cy="45" rx="2.5" ry="1" fill="#2B2A26" />
        <line x1="39" y1="45" x2="39" y2="12" stroke="#2B2A26" strokeWidth="3" strokeLinecap="round" />
        <path
          d="M39 12 L54 17 L39 23 Z"
          fill="#C0392B"
          stroke="#2B2A26"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <circle cx="20" cy="50" r="3.5" fill="#FFFFFF" stroke="#2B2A26" strokeWidth="1.8" />
      </svg>
    </div>,
    size,
  );
}
