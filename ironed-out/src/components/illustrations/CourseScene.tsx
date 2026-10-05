/** Rolling hills, green, waving flag, sun, cloud and a ball on its dashed flight path. */
import { SHOT, SHOT_PATH, SHOT_SECONDS } from './shot';
import { WindFlag } from './WindFlag';

const DUR = `${SHOT_SECONDS}s`;

const trailProps = {
  d: SHOT_PATH,
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
          <path
            d={SHOT_PATH}
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="8"
            pathLength="1"
            strokeDasharray="1 2"
          >
            <animate
              attributeName="stroke-dashoffset"
              dur={DUR}
              repeatCount="indefinite"
              keyTimes={SHOT.keyTimes}
              values={SHOT.trailOffsets}
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
      <WindFlag x={232} top={66} length={38} height={23} />
      <g className="motion">
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
            path={SHOT_PATH}
            dur={DUR}
            repeatCount="indefinite"
            calcMode="linear"
            keyTimes={SHOT.keyTimes}
            keyPoints={SHOT.keyPoints}
          />
        </circle>
      </g>
      {/* Reduced motion: the finished shot, at rest. */}
      <g className="motion-still">
        <path {...trailProps} />
        <circle cx="128" cy="160" r="7" fill="#FFFFFF" stroke="#2B2A26" strokeWidth="2" />
      </g>
    </svg>
  );
}
