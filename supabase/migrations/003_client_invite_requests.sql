-- Client portal invite requests from sales (owner approval required)

CREATE TABLE IF NOT EXISTS public.client_invite_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  client_name TEXT,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_invite_requests_status
  ON public.client_invite_requests(status);
CREATE INDEX IF NOT EXISTS idx_client_invite_requests_requested_by
  ON public.client_invite_requests(requested_by);
CREATE INDEX IF NOT EXISTS idx_client_invite_requests_email
  ON public.client_invite_requests(email);

CREATE TRIGGER client_invite_requests_updated_at
  BEFORE UPDATE ON public.client_invite_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.client_invite_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service full access client_invite_requests"
  ON public.client_invite_requests FOR ALL USING (true) WITH CHECK (true);
