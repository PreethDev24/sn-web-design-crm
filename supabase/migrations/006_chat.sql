-- Direct messaging: owner ↔ client, owner ↔ sales

CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_one_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  participant_two_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT conversations_distinct_participants CHECK (participant_one_id <> participant_two_id),
  CONSTRAINT conversations_ordered_pair CHECK (participant_one_id::text < participant_two_id::text),
  CONSTRAINT conversations_unique_pair UNIQUE (participant_one_id, participant_two_id)
);

CREATE INDEX IF NOT EXISTS idx_conversations_participant_one ON public.conversations(participant_one_id);
CREATE INDEX IF NOT EXISTS idx_conversations_participant_two ON public.conversations(participant_two_id);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message ON public.conversations(last_message_at DESC);

CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(trim(body)) > 0 AND char_length(body) <= 5000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON public.messages(conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON public.messages(sender_id);
