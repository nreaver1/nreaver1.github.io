/** Rolling hills, green, waving flag, sun, cloud and a ball on its dashed flight path. */

// Tee shot, two bounces, then a short roll to where the ball rests.
const FLIGHT = 'M30 196 Q64 30 98 156 Q106 128 114 156 Q119 142 124 157 Q126 158.5 128 160';

// One 6s loop: sit on the tee, fly, bounce, bounce, roll, rest, fade out.
// Points are fractions of the path length at each apex/landing so the ball
// slows near the top of each arc (ease-out up, ease-in down).
const DUR = '6s';
const KEY_TIMES = '0;0.0667;0.1583;0.25;0.2917;0.3333;0.3567;0.38;0.4333;1';
const KEY_POINTS = '0;0;0.465;0.748;0.823;0.897;0.935;0.978;1;1';
const TRAIL_OFFSETS = '1;1;0.535;0.252;0.177;0.103;0.065;0.022;0;0';
const UP = '0.2 0.6 0.5 1';
const DOWN = '0.5 0 0.8 0.4';
const LINEAR = '0 0 1 1';
const KEY_SPLINES = [LINEAR, UP, DOWN, UP, DOWN, UP, DOWN, '0.2 0.6 0.4 1', LINEAR].join(';');

const trailProps = {
  d: FLIGHT,
  fill: 'none',
  stroke: '#2B2A26',
  strokeWidth: 2,
  strokeDasharray: '3 7',
  strokeLinecap: 'round',
} as const;

export function CourseScene({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 334 210" width="100%" className={className} aria-hidden="true" focusable="false">
      <defs>
        {/* Reveals the dashed trail just behind the ball as it travels. */}
        <mask id="course-trail-reveal" maskUnits="userSpaceOnUse" x="0" y="0" width="334" height="210">
          <path d={FLIGHT} fill="none" stroke="#FFFFFF" strokeWidth="8" pathLength="1" strokeDasharray="1 2">
            <animate
              attributeName="stroke-dashoffset"
              dur={DUR}
              repeatCount="indefinite"
              calcMode="spline"
              keyTimes={KEY_TIMES}
              values={TRAIL_OFFSETS}
              keySplines={KEY_SPLINES}
            />
          </path>
        </mask>
      </defs>
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
      <g className="ball-flight">
        <animate
          attributeName="opacity"
          dur={DUR}
          repeatCount="indefinite"
          keyTimes="0;0.8833;0.95;1"
          values="1;1;0;0"
        />
        <path {...trailProps} mask="url(#course-trail-reveal)" />
        <circle r="7" fill="#FFFFFF" stroke="#2B2A26" strokeWidth="2">
          <animateMotion
            path={FLIGHT}
            dur={DUR}
            repeatCount="indefinite"
            calcMode="spline"
            keyTimes={KEY_TIMES}
            keyPoints={KEY_POINTS}
            keySplines={KEY_SPLINES}
          />
        </circle>
      </g>
      {/* Reduced motion: the finished shot, at rest. */}
      <g className="ball-rest">
        <path {...trailProps} />
        <circle cx="128" cy="160" r="7" fill="#FFFFFF" stroke="#2B2A26" strokeWidth="2" />
      </g>
    </svg>
  );
}
