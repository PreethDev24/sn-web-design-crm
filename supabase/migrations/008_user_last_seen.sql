-- Track when users were last active in the app (for offline email notifications)

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_last_seen ON public.users(last_seen_at DESC);
