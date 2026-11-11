CREATE TABLE public.physics_explorer_guest_saves (
  key_hash text PRIMARY KEY
    CHECK (key_hash ~ '^[0-9a-f]{64}$'),
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT physics_explorer_guest_saves_payload_shape
    CHECK (
      jsonb_typeof(payload) = 'object'
      AND jsonb_typeof(payload -> 'collections') = 'object'
      AND jsonb_typeof(payload -> 'plans') = 'object'
    )
);

ALTER TABLE public.physics_explorer_guest_saves ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.physics_explorer_guest_saves FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.physics_explorer_guest_saves TO service_role;
