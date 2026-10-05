/** A pennant on a pole that ripples gently, the wave running out from the pole to the tip. */

const FRAMES = 16;
const RIPPLE = 2.2; // how far the cloth bows, in SVG units
const TRAVEL = 1.1; // phase lag between points further from the pole

type Point = [number, number];

function pennant(x: number, top: number, length: number, height: number, phase: number | null): string {
  const mid = top + height / 2;
  const sway = (k: number) => (phase === null ? 0 : RIPPLE * k * Math.sin(phase - TRAVEL * 3 * k));
  // Points 1/3 and 2/3 out along the top and bottom edges, plus the tip.
  const along = (k: number, edgeY: number): Point => [x + length * k, edgeY + (mid - edgeY) * k + sway(k)];
  const tipShift = phase === null ? 0 : Math.sin(phase - TRAVEL * 3);
  const tip: Point = [x + length * (1 - 0.03 * (1 + tipShift)), mid + sway(1) * 0.6];
  const [t1, t2, b2, b1] = [
    along(1 / 3, top),
    along(2 / 3, top),
    along(2 / 3, top + height),
    along(1 / 3, top + height),
  ];
  const f = ([px, py]: Point) => `${px.toFixed(1)} ${py.toFixed(1)}`;
  return `M${x} ${top} C${f(t1)} ${f(t2)} ${f(tip)} C${f(b2)} ${f(b1)} ${x} ${top + height}Z`;
}

export function WindFlag({
  x,
  top,
  length,
  height,
}: {
  x: number;
  top: number;
  length: number;
  height: number;
}) {
  const frames = Array.from({ length: FRAMES + 1 }, (_, i) =>
    pennant(x, top, length, height, (i / FRAMES) * 2 * Math.PI),
  );
  const shared = { fill: '#C0392B', stroke: '#2B2A26', strokeWidth: 2, strokeLinejoin: 'round' } as const;
  return (
    <>
      <path className="motion" d={frames[0]} {...shared}>
        <animate attributeName="d" dur="2.4s" repeatCount="indefinite" values={frames.join(';')} />
      </path>
      <path className="motion-still" d={pennant(x, top, length, height, null)} {...shared} />
    </>
  );
}
