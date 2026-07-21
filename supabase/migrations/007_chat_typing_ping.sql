-- Typing presence + ping messages

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS typing_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS typing_until TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_conversations_typing
  ON public.conversations(typing_user_id, typing_until);

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'text';

ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_kind_check;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_kind_check CHECK (kind IN ('text', 'ping'));
