CREATE TABLE public.folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 120),
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.folders TO authenticated;
GRANT ALL ON public.folders TO service_role;
ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own folders" ON public.folders FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.folder_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id uuid NOT NULL REFERENCES public.folders(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 180),
  content text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.folder_notes TO authenticated;
GRANT ALL ON public.folder_notes TO service_role;
ALTER TABLE public.folder_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own folder notes" ON public.folder_notes FOR ALL TO authenticated
USING (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.folders f WHERE f.id = folder_id AND f.user_id = auth.uid()))
WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.folders f WHERE f.id = folder_id AND f.user_id = auth.uid()));

CREATE TABLE public.folder_benefits (
  folder_id uuid NOT NULL REFERENCES public.folders(id) ON DELETE CASCADE,
  benefit_id uuid NOT NULL REFERENCES public.benefits(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (folder_id, benefit_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.folder_benefits TO authenticated;
GRANT ALL ON public.folder_benefits TO service_role;
ALTER TABLE public.folder_benefits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own folder benefits" ON public.folder_benefits FOR ALL TO authenticated
USING (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.folders f WHERE f.id = folder_id AND f.user_id = auth.uid()) AND EXISTS (SELECT 1 FROM public.benefits b WHERE b.id = benefit_id AND b.user_id = auth.uid()))
WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.folders f WHERE f.id = folder_id AND f.user_id = auth.uid()) AND EXISTS (SELECT 1 FROM public.benefits b WHERE b.id = benefit_id AND b.user_id = auth.uid()));

CREATE INDEX folders_user_updated_idx ON public.folders(user_id, updated_at DESC);
CREATE INDEX folder_notes_folder_updated_idx ON public.folder_notes(folder_id, updated_at DESC);
CREATE INDEX folder_benefits_benefit_idx ON public.folder_benefits(benefit_id);

CREATE TRIGGER folders_touch BEFORE UPDATE ON public.folders FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER folder_notes_touch BEFORE UPDATE ON public.folder_notes FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();