-- Sales rep onboarding profiles (required before CRM access)

CREATE TABLE IF NOT EXISTS public.sales_profiles (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  calling_from TEXT,
  calling_schedule TEXT,
  target_region TEXT,
  daily_call_goal INTEGER,
  weekly_meeting_goal INTEGER,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_profiles_email ON public.sales_profiles(email);
CREATE INDEX IF NOT EXISTS idx_sales_profiles_region ON public.sales_profiles(target_region);

CREATE TRIGGER sales_profiles_updated_at
  BEFORE UPDATE ON public.sales_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.sales_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service full access sales_profiles"
  ON public.sales_profiles FOR ALL USING (true) WITH CHECK (true);
