// supabase/functions/_shared/secret-key.ts
//
// Supabase is deprecating the JWT-based `anon` / `service_role` keys in
// favor of `publishable` (sb_publishable_...) and `secret` (sb_secret_...)
// keys. Edge Functions get both generations injected into their
// environment automatically:
//   - New:    SUPABASE_SECRET_KEYS       -- JSON object keyed by key name,
//                                           e.g. '{"default":"sb_secret_..."}'
//   - Legacy: SUPABASE_SERVICE_ROLE_KEY  -- plain JWT string
//
// This helper reads the new key first and only falls back to the legacy
// var if the project hasn't created secret keys yet (Settings > API Keys
// > "Publishable and secret API keys" tab). Once you've confirmed nothing
// depends on the legacy key (see Supabase's migration guide, Step 5), you
// can delete the fallback branch.

export function getSecretKey(keyName = "default"): string {
  const newKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (newKeys) {
    try {
      const parsed = JSON.parse(newKeys);
      if (parsed[keyName]) return parsed[keyName];
    } catch {
      // fall through to legacy lookup if the env var isn't valid JSON
      // for some reason (shouldn't happen on the real platform)
    }
  }

  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;

  throw new Error(
    "No Supabase secret key found. Create one under Settings > API Keys " +
      "> Publishable and secret API keys, or confirm SUPABASE_SERVICE_ROLE_KEY " +
      "is set if still on legacy keys.",
  );
}
