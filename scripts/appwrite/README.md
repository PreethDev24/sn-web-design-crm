# Appwrite migration tooling

## Prerequisites
1. Complete [PHASE0.md](./PHASE0.md) (Appwrite Pro project + API key in `.env.local`).
2. Keep Supabase credentials in `.env.local` only until export finishes.

## Commands
```bash
npm run appwrite:setup    # create DB, collections, indexes, buckets
npm run appwrite:export   # dump Supabase tables + storage → scripts/appwrite/data/
npm run appwrite:import   # load JSON + files into Appwrite (rewrites file URLs)
```

## Cutover checklist
1. Freeze writes (or run during low traffic).
2. Re-run export + import for a final delta.
3. Set `DATA_BACKEND=appwrite` and Appwrite env vars on Netlify / local.
4. Smoke test: sign-in, Team/Contacts, leads, deliverable file, contract PDF, chat, invoice webhook, audit log.
5. Remove Supabase env vars from production once stable.

## Notes
- Document IDs preserve Supabase UUIDs / project text IDs when valid for Appwrite (≤36 chars, `[a-zA-Z0-9._-]`).
- Invalid IDs are remapped; see `data/id-map.json` after import.
- `supabase/migrations/` is historical reference only — schema is created by `setup-schema.mjs`.
