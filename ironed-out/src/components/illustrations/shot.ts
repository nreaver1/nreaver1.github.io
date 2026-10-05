/**
 * Timing for the tee shot in CourseScene. Each arc is a quadratic Bezier, and a
 * quadratic walked at a constant parameter speed is exactly a thrown object
 * (steady sideways speed, steady pull down), so sampling it evenly in time gives
 * natural flight with no stops at the top of an arc. animateMotion moves by
 * distance along the path, so the samples are converted to distance fractions.
 */

type Point = [number, number];
type Arc = { from: Point; ctrl: Point; to: Point; seconds: number; roll?: boolean };

const ARCS: Arc[] = [
  { from: [30, 196], ctrl: [64, 30], to: [98, 156], seconds: 1.1 },
  { from: [98, 156], ctrl: [106, 128], to: [114, 156], seconds: 0.48 },
  { from: [114, 156], ctrl: [119, 142], to: [124, 157], seconds: 0.34 },
  { from: [124, 157], ctrl: [126, 158.5], to: [128, 160], seconds: 0.4, roll: true },
];

export const SHOT_SECONDS = 6;
const TEE_PAUSE = 0.4;
const FPS = 60;

const at = ({ from, ctrl, to }: Arc, t: number): Point => {
  const u = 1 - t;
  return [0, 1].map((i) => u * u * from[i]! + 2 * u * t * ctrl[i]! + t * t * to[i]!) as Point;
};

export const SHOT_PATH =
  `M${ARCS[0]!.from.join(' ')} ` + ARCS.map((a) => `Q${a.ctrl.join(' ')} ${a.to.join(' ')}`).join(' ');

function buildTimeline() {
  // Distance travelled at fine parameter steps, so any (arc, t) maps to a fraction.
  const STEPS = 400;
  const lengths: number[][] = [];
  let total = 0;
  for (const arc of ARCS) {
    const row = [total];
    let prev = at(arc, 0);
    for (let s = 1; s <= STEPS; s++) {
      const p = at(arc, s / STEPS);
      total += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
      row.push(total);
      prev = p;
    }
    lengths.push(row);
  }
  const distance = (i: number, t: number) => {
    const exact = t * STEPS;
    const lo = Math.floor(exact);
    const row = lengths[i]!;
    const hi = Math.min(lo + 1, STEPS);
    return row[lo]! + (row[hi]! - row[lo]!) * (exact - lo);
  };

  const times = [0, TEE_PAUSE];
  const points = [0, 0];
  let clock = TEE_PAUSE;
  ARCS.forEach((arc, i) => {
    const frames = Math.max(2, Math.round(arc.seconds * FPS));
    for (let f = 1; f <= frames; f++) {
      const u = f / frames;
      const t = arc.roll ? 1 - (1 - u) * (1 - u) : u; // the roll slows to a stop
      times.push(clock + arc.seconds * u);
      points.push(distance(i, t) / total);
    }
    clock += arc.seconds;
  });
  times.push(SHOT_SECONDS);
  points.push(1);

  const fmt = (n: number) => String(Number(n.toFixed(4)));
  return {
    keyTimes: times.map((t) => fmt(t / SHOT_SECONDS)).join(';'),
    keyPoints: points.map(fmt).join(';'),
    trailOffsets: points.map((p) => fmt(1 - p)).join(';'),
  };
}

export const SHOT = buildTimeline();
