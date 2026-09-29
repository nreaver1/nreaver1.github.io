/**
 * Marks a seeded sample account (osrs-luck-database/supabase/seed-demo.sql)
 * so visitors never mistake it for a real player.
 */
export default function DemoBadge({ className = "" }: { className?: string }) {
  return (
    <span
      title="Sample account with made-up drops, here so you can try the site"
      className={`inline-block border border-brass/60 px-1.5 py-px align-middle font-mono text-[0.65rem] font-normal uppercase leading-normal tracking-wide text-brass ${className}`}
    >
      Demo
    </span>
  );
}
