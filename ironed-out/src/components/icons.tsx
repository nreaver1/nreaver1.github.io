/** Hand-drawn-style line icons from the design. Decorative: pair them with visible text or aria-label. */
type IconProps = { size?: number; className?: string };

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
});

export const PlusIcon = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} strokeWidth={2.4} className={className}>
    <path d="M12 5 V19 M5 12 H19" />
  </svg>
);

export const MinusIcon = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} strokeWidth={2.4} className={className}>
    <path d="M5 12 H19" />
  </svg>
);

export const TrashIcon = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} strokeWidth={2} className={className}>
    <path d="M5 7 H19 M9 7 V4 H15 V7 M7 7 L8 20 H16 L17 7" />
  </svg>
);

export const CalendarIcon = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} strokeWidth={2} className={className}>
    <rect x="4" y="5" width="16" height="15" rx="2" />
    <path d="M4 10 H20 M9 3 V7 M15 3 V7" />
  </svg>
);

export const BellIcon = ({ size = 22, className }: IconProps) => (
  <svg {...base(size)} strokeWidth={2.2} className={className}>
    <path d="M6 16 V11 a6 6 0 0 1 12 0 V16 L20 18 H4 Z" />
    <path d="M10 21 h4" />
  </svg>
);

export const CloseIcon = ({ size = 18, className }: IconProps) => (
  <svg {...base(size)} strokeWidth={2.4} className={className}>
    <path d="M6 6 L18 18 M18 6 L6 18" />
  </svg>
);

export const SearchIcon = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} strokeWidth={2.2} className={className}>
    <circle cx="11" cy="11" r="6" />
    <path d="M16 16 L20 20" />
  </svg>
);

export const ChevronIcon = ({ size = 22, className }: IconProps) => (
  <svg {...base(size)} strokeWidth={2.2} className={className}>
    <path d="M9 5 L16 12 L9 19" />
  </svg>
);

export const CheckIcon = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} strokeWidth={2.4} className={className}>
    <path d="M5 12 L10 17 L19 7" />
  </svg>
);

export const LockIcon = ({ size = 18, className }: IconProps) => (
  <svg {...base(size)} strokeWidth={2} className={className}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11 V8 a4 4 0 0 1 8 0 V11" />
  </svg>
);
