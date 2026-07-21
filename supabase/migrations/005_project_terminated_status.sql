-- Allow owners to terminate projects

ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_status_check;

ALTER TABLE public.projects
  ADD CONSTRAINT projects_status_check
  CHECK (status IN (
    'discovery',
    'wireframing',
    'design',
    'development',
    'revisions',
    'launch',
    'maintenance',
    'completed',
    'on_hold',
    'terminated'
  ));
