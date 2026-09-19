
CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT public.current_org() REFERENCES public.organizations(id),
  product_code text,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  standard_batch_gallons numeric NOT NULL DEFAULT 40 CHECK (standard_batch_gallons > 0),
  bag_size_gallons numeric NOT NULL DEFAULT 1 CHECK (bag_size_gallons > 0),
  bags_per_case integer NOT NULL DEFAULT 4 CHECK (bags_per_case > 0),
  approved_ingredient_statement text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,id),
  UNIQUE (organization_id,product_code)
);
CREATE UNIQUE INDEX ss_products_org_name ON public.products(organization_id,lower(btrim(name)));

CREATE TABLE public.recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT public.current_org() REFERENCES public.organizations(id),
  product_id uuid NOT NULL,
  name text NOT NULL CHECK (btrim(name) <> ''),
  active_version_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,id),
  UNIQUE (organization_id,product_id),
  FOREIGN KEY (organization_id,product_id) REFERENCES public.products(organization_id,id)
);

CREATE TABLE public.recipe_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT public.current_org() REFERENCES public.organizations(id),
  recipe_id uuid NOT NULL,
  version_number integer NOT NULL CHECK (version_number > 0),
  status text NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft','Released','Retired')),
  target_yield_gallons numeric NOT NULL DEFAULT 40 CHECK (target_yield_gallons > 0),
  source_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  released_at timestamptz,
  released_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,id),
  UNIQUE (organization_id,recipe_id,id),
  UNIQUE (recipe_id,version_number),
  FOREIGN KEY (organization_id,recipe_id) REFERENCES public.recipes(organization_id,id),
  CHECK (
    (status='Draft' AND released_at IS NULL AND released_by IS NULL)
    OR
    (status<>'Draft' AND released_at IS NOT NULL AND released_by IS NOT NULL)
  )
);

ALTER TABLE public.recipes
  ADD CONSTRAINT ss_active_version_same_recipe
  FOREIGN KEY (organization_id,id,active_version_id)
  REFERENCES public.recipe_versions(organization_id,recipe_id,id);

CREATE TABLE public.recipe_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT public.current_org() REFERENCES public.organizations(id),
  recipe_version_id uuid NOT NULL,
  name text NOT NULL CHECK (btrim(name) <> ''),
  sequence integer NOT NULL CHECK (sequence > 0),
  source_heading text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,recipe_version_id,id),
  UNIQUE (recipe_version_id,sequence),
  FOREIGN KEY (organization_id,recipe_version_id)
    REFERENCES public.recipe_versions(organization_id,id)
);

CREATE TABLE public.recipe_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT public.current_org() REFERENCES public.organizations(id),
  recipe_version_id uuid NOT NULL,
  recipe_section_id uuid NOT NULL,
  ingredient_id uuid NOT NULL,
  source_line_key text NOT NULL,
  sequence integer NOT NULL CHECK (sequence > 0),
  display_measurement text NOT NULL CHECK (btrim(display_measurement) <> ''),
  normalized_quantity numeric NOT NULL CHECK (normalized_quantity > 0),
  normalized_uom text NOT NULL CHECK (normalized_uom IN ('lb','oz','gal','each')),
  pounds_equivalent numeric CHECK (pounds_equivalent > 0),
  operator_note text,
  source_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (recipe_version_id,source_line_key),
  UNIQUE (recipe_version_id,sequence),
  FOREIGN KEY (organization_id,recipe_version_id)
    REFERENCES public.recipe_versions(organization_id,id),
  FOREIGN KEY (organization_id,recipe_version_id,recipe_section_id)
    REFERENCES public.recipe_sections(organization_id,recipe_version_id,id),
  FOREIGN KEY (organization_id,ingredient_id)
    REFERENCES public.ingredients(organization_id,id)
);

CREATE TABLE public.recipe_qc_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT public.current_org() REFERENCES public.organizations(id),
  recipe_version_id uuid NOT NULL,
  name text NOT NULL,
  min_value numeric NOT NULL,
  max_value numeric NOT NULL,
  uom text NOT NULL,
  instructions text NOT NULL DEFAULT '',
  source_text text NOT NULL,
  sequence integer NOT NULL CHECK (sequence > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (max_value >= min_value),
  FOREIGN KEY (organization_id,recipe_version_id)
    REFERENCES public.recipe_versions(organization_id,id)
);

CREATE TABLE public.recipe_seed_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  seed_key text NOT NULL,
  source_sha256 text NOT NULL,
  line_projection_sha256 text NOT NULL,
  record_counts jsonb NOT NULL,
  approved_by uuid NOT NULL REFERENCES auth.users(id),
  applied_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,seed_key)
);

CREATE OR REPLACE FUNCTION public.ss_guard_recipe_child()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=''
AS $$
DECLARE st text;
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    SELECT status INTO st
    FROM public.recipe_versions
    WHERE id=OLD.recipe_version_id AND organization_id=OLD.organization_id
    FOR SHARE;
    IF st IS DISTINCT FROM 'Draft' THEN
      RAISE EXCEPTION 'Released/retired recipe content is immutable; create a new version.';
    END IF;
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN
    SELECT status INTO st
    FROM public.recipe_versions
    WHERE id=NEW.recipe_version_id AND organization_id=NEW.organization_id
    FOR SHARE;
    IF st IS DISTINCT FROM 'Draft' THEN
      RAISE EXCEPTION 'Recipe content can be changed only under a Draft version.';
    END IF;
    RETURN NEW;
  END IF;
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.ss_guard_recipe_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=''
AS $$
BEGIN
  IF TG_OP='INSERT' AND NEW.status <> 'Draft' THEN
    RAISE EXCEPTION 'Insert as Draft, add content, then release.';
  END IF;

  IF TG_OP='UPDATE' AND OLD.status IN ('Released','Retired') THEN
    IF NOT (
      OLD.status='Released'
      AND NEW.status='Retired'
      AND (to_jsonb(NEW)-'status')=(to_jsonb(OLD)-'status')
    ) THEN
      RAISE EXCEPTION 'Released/retired recipe versions are immutable; create a new version.';
    END IF;
  END IF;

  IF TG_OP='UPDATE' AND OLD.status='Draft' AND NEW.status='Released' THEN
    IF NOT EXISTS (SELECT 1 FROM public.recipe_sections WHERE recipe_version_id=NEW.id)
       OR NOT EXISTS (SELECT 1 FROM public.recipe_lines WHERE recipe_version_id=NEW.id) THEN
      RAISE EXCEPTION 'Cannot release an empty recipe.';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.recipe_sections s
      WHERE s.recipe_version_id=NEW.id
        AND NOT EXISTS (
          SELECT 1 FROM public.recipe_lines l WHERE l.recipe_section_id=s.id
        )
    ) THEN
      RAISE EXCEPTION 'Cannot release a recipe containing an empty section.';
    END IF;

    IF NEW.released_by IS NULL
       OR NOT EXISTS (
         SELECT 1 FROM public.profiles p
         WHERE p.id=NEW.released_by
           AND p.organization_id=NEW.organization_id
           AND p.role='admin'
           AND p.active
       ) THEN
      RAISE EXCEPTION 'Release requires an active administrator in this organization.';
    END IF;

    NEW.released_at := coalesce(NEW.released_at,clock_timestamp());
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.ss_guard_active_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=''
AS $$
DECLARE st text;
BEGIN
  IF NEW.active_version_id IS NOT NULL THEN
    SELECT status INTO st
    FROM public.recipe_versions
    WHERE id=NEW.active_version_id
      AND recipe_id=NEW.id
      AND organization_id=NEW.organization_id
    FOR SHARE;
    IF st IS DISTINCT FROM 'Released' THEN
      RAISE EXCEPTION 'Active recipe version must be Released and belong to this recipe.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER ss_version_guard
  BEFORE INSERT OR UPDATE ON public.recipe_versions
  FOR EACH ROW EXECUTE FUNCTION public.ss_guard_recipe_version();

CREATE TRIGGER ss_active_version_guard
  BEFORE INSERT OR UPDATE OF active_version_id ON public.recipes
  FOR EACH ROW EXECUTE FUNCTION public.ss_guard_active_version();

CREATE TRIGGER ss_section_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.recipe_sections
  FOR EACH ROW EXECUTE FUNCTION public.ss_guard_recipe_child();

CREATE TRIGGER ss_line_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.recipe_lines
  FOR EACH ROW EXECUTE FUNCTION public.ss_guard_recipe_child();

CREATE TRIGGER ss_qc_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.recipe_qc_rules
  FOR EACH ROW EXECUTE FUNCTION public.ss_guard_recipe_child();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'products','recipes','recipe_versions','recipe_sections','recipe_lines','recipe_qc_rules','recipe_seed_runs'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated',t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON TABLE public.%I TO authenticated',t);
    EXECUTE format(
      'CREATE POLICY ss_read ON public.%I FOR SELECT TO authenticated USING (organization_id=(select public.current_org()) AND (select public.current_role()) IN (''admin'',''reviewer''))',
      t
    );
    EXECUTE format(
      'CREATE POLICY ss_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (organization_id=(select public.current_org()) AND (select public.current_role())=''admin'')',
      t
    );
    EXECUTE format(
      'CREATE POLICY ss_update ON public.%I FOR UPDATE TO authenticated USING (organization_id=(select public.current_org()) AND (select public.current_role())=''admin'') WITH CHECK (organization_id=(select public.current_org()) AND (select public.current_role())=''admin'')',
      t
    );
  END LOOP;
END;
$$;

CREATE TRIGGER ss_products_audit AFTER INSERT OR UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.audit_change();
CREATE TRIGGER ss_recipes_audit AFTER INSERT OR UPDATE ON public.recipes
  FOR EACH ROW EXECUTE FUNCTION public.audit_change();
CREATE TRIGGER ss_recipe_versions_audit AFTER INSERT OR UPDATE ON public.recipe_versions
  FOR EACH ROW EXECUTE FUNCTION public.audit_change();
CREATE TRIGGER ss_recipe_sections_audit AFTER INSERT OR UPDATE ON public.recipe_sections
  FOR EACH ROW EXECUTE FUNCTION public.audit_change();
CREATE TRIGGER ss_recipe_lines_audit AFTER INSERT OR UPDATE ON public.recipe_lines
  FOR EACH ROW EXECUTE FUNCTION public.audit_change();
CREATE TRIGGER ss_recipe_qc_audit AFTER INSERT OR UPDATE ON public.recipe_qc_rules
  FOR EACH ROW EXECUTE FUNCTION public.audit_change();

REVOKE EXECUTE ON FUNCTION public.ss_guard_recipe_child(), public.ss_guard_recipe_version(), public.ss_guard_active_version()
FROM PUBLIC, anon, authenticated;

NOTIFY pgrst,'reload schema';
