// supabase/functions/_shared/players.ts
//
// IGNs aren't unique in `players`: a real player can share a name with a
// seeded demo account (supabase/seed-demo.sql), and after a name change
// the old owner's row keeps the name until they next log in with the
// plugin (which then re-registers with the new IGN), while the new owner
// may already have registered under it.

export interface PlayerRow {
  account_hash: string;
  ign: string;
  last_updated: string;
}

// Demo accounts are seeded with this prefix, which never matches a real
// Long.toHexString account hash.
export const isDemoAccount = (accountHash: string) => accountHash.startsWith("demo-");

// Picks which of several players sharing an IGN a lookup means: a real
// player over a demo one, then whoever updated their record most recently.
export function pickPlayer<T extends PlayerRow>(rows: T[]): T | null {
  if (rows.length === 0) return null;
  return [...rows].sort((a, b) => {
    const demo = Number(isDemoAccount(a.account_hash)) - Number(isDemoAccount(b.account_hash));
    if (demo !== 0) return demo;
    return Date.parse(b.last_updated) - Date.parse(a.last_updated);
  })[0];
}
