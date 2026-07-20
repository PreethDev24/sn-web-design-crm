-- Project IDs: 4-letter company prefix + 4 digits (e.g. ACME4829)

ALTER TABLE deliverables DROP CONSTRAINT IF EXISTS deliverables_project_id_fkey;
ALTER TABLE activities DROP CONSTRAINT IF EXISTS activities_project_id_fkey;
ALTER TABLE contracts DROP CONSTRAINT IF EXISTS contracts_project_id_fkey;
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_project_id_fkey;

ALTER TABLE projects ALTER COLUMN id DROP DEFAULT;

ALTER TABLE deliverables
  ALTER COLUMN project_id TYPE TEXT USING project_id::text;

ALTER TABLE activities
  ALTER COLUMN project_id TYPE TEXT USING project_id::text;

ALTER TABLE contracts
  ALTER COLUMN project_id TYPE TEXT USING project_id::text;

ALTER TABLE invoices
  ALTER COLUMN project_id TYPE TEXT USING project_id::text;

ALTER TABLE projects
  ALTER COLUMN id TYPE TEXT USING id::text;

ALTER TABLE deliverables
  ADD CONSTRAINT deliverables_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

ALTER TABLE activities
  ADD CONSTRAINT activities_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

ALTER TABLE contracts
  ADD CONSTRAINT contracts_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;

ALTER TABLE invoices
  ADD CONSTRAINT invoices_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;
