/** Rolling hills, green, waving flag, sun, cloud and a ball on its dashed flight path. */
export function CourseScene({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 334 210" width="100%" className={className} aria-hidden="true" focusable="false">
      <circle cx="285" cy="42" r="18" fill="#F2C14E" stroke="#2B2A26" strokeWidth="2" />
      <path
        d="M40 52 q6 -14 20 -8 q8 -12 22 -2 q14 0 10 12 z"
        fill="#FFFFFF"
        stroke="#2B2A26"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M0 140 Q80 92 170 126 T334 110 L334 210 L0 210Z"
        fill="#A8CC94"
        stroke="#2B2A26"
        strokeWidth="2"
      />
      <path
        d="M0 172 Q120 142 230 166 T334 160 L334 210 L0 210Z"
        fill="#6FA35F"
        stroke="#2B2A26"
        strokeWidth="2"
      />
      <ellipse cx="226" cy="146" rx="52" ry="12" fill="#4E8B4A" stroke="#2B2A26" strokeWidth="2" />
      <ellipse cx="232" cy="146" rx="7" ry="2.6" fill="#2B2A26" />
      <line x1="232" y1="146" x2="232" y2="66" stroke="#2B2A26" strokeWidth="3" strokeLinecap="round" />
      <path
        className="flag-wave"
        d="M232 66 L270 77 L232 89 Z"
        fill="#C0392B"
        stroke="#2B2A26"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M30 196 Q80 40 128 156"
        fill="none"
        stroke="#2B2A26"
        strokeWidth="2"
        strokeDasharray="3 7"
        strokeLinecap="round"
      />
      <circle cx="128" cy="160" r="7" fill="#FFFFFF" stroke="#2B2A26" strokeWidth="2" />
    </svg>
  );
}
