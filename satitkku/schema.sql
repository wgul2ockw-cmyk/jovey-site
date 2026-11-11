CREATE TABLE public.physics_explorer_user_data (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  payload jsonb NOT NULL DEFAULT '{"collections":{"disruptive":{},"labs":{},"ap":{}},"plans":{}}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT physics_explorer_user_data_payload_object
    CHECK (jsonb_typeof(payload) = 'object')
);

ALTER TABLE public.physics_explorer_user_data ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.physics_explorer_user_data FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE ON public.physics_explorer_user_data TO authenticated;

CREATE POLICY "Users read their own physics plan"
  ON public.physics_explorer_user_data FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert their own physics plan"
  ON public.physics_explorer_user_data FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update their own physics plan"
  ON public.physics_explorer_user_data FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
