-- ============================================================
-- East County Food Access Network — Full Database Schema
-- Run this once in the Supabase SQL Editor (project dashboard → SQL)
-- Safe to re-run: uses IF NOT EXISTS, DROP IF EXISTS, ON CONFLICT DO NOTHING
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABLES
-- All CREATE TABLE statements first so every function body
-- can reference them without forward-reference errors.
-- ============================================================

CREATE TABLE IF NOT EXISTS organizations (
  id          uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        text        NOT NULL,
  domain      text        UNIQUE,
  is_verified boolean     NOT NULL DEFAULT false,
  website     text,
  phone       text,
  email       text,
  logo_url    text,
  created_by  uuid        REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_organizations_domain
  ON organizations(domain) WHERE domain IS NOT NULL;

CREATE TABLE IF NOT EXISTS posts (
  id              uuid             PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid             REFERENCES organizations(id),
  title           text             NOT NULL,
  description     text,
  address         text,
  city            text,
  zip             text,
  neighborhood    text,
  location_name   text,
  latitude        double precision,
  longitude       double precision,
  start_time      timestamptz,
  end_time        timestamptz,
  category        text,
  tags            text[],
  image_url       text,
  status          text             NOT NULL DEFAULT 'published'
                                   CHECK (status IN ('draft', 'pending_review', 'published', 'archived')),
  is_active        boolean          NOT NULL DEFAULT true,
  is_recurring     boolean          NOT NULL DEFAULT false,
  recurrence_rule  text,
  expires_at       timestamptz,
  created_at       timestamptz      NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS post_occurrences (
  id           uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id      uuid        REFERENCES posts(id) ON DELETE CASCADE,
  start_time   timestamptz,
  end_time     timestamptz,
  expires_at   timestamptz,
  is_cancelled boolean     NOT NULL DEFAULT false,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS profiles (
  id         uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      text        UNIQUE NOT NULL,
  full_name  text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS app_admins (
  user_id    uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS organization_members (
  id              uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role            text        NOT NULL DEFAULT 'member'
                              CHECK (role IN ('owner', 'admin', 'member')),
  created_at      timestamptz NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE(user_id, organization_id)
);

CREATE TABLE IF NOT EXISTS pending_organizations (
  id               uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email            text        NOT NULL,
  requested_domain text,
  requested_name   text,
  website          text,
  phone            text,
  notes            text,
  status           text        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at       timestamptz NOT NULL DEFAULT timezone('utc', now()),
  reviewed_at      timestamptz,
  reviewed_by      uuid        REFERENCES auth.users(id)
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE organizations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_occurrences      ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles               ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_admins             ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_organizations ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- HELPER FUNCTIONS
-- Tables they reference exist above, so Postgres can validate bodies.
-- ============================================================

CREATE OR REPLACE FUNCTION is_app_admin()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM app_admins WHERE user_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION is_org_member(org_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE user_id = auth.uid() AND organization_id = org_id
  );
$$;

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- profiles: users see/edit only their own row
DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;

CREATE POLICY "profiles_select_own" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles_insert_own" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- app_admins: visible to self and other admins
DROP POLICY IF EXISTS "app_admins_select" ON app_admins;

CREATE POLICY "app_admins_select" ON app_admins
  FOR SELECT USING (auth.uid() = user_id OR is_app_admin());

-- organization_members: users see own rows; row writes go through RPCs
DROP POLICY IF EXISTS "org_members_select"    ON organization_members;
DROP POLICY IF EXISTS "org_members_all_admin" ON organization_members;

CREATE POLICY "org_members_select" ON organization_members
  FOR SELECT USING (auth.uid() = user_id OR is_app_admin());

CREATE POLICY "org_members_all_admin" ON organization_members
  FOR ALL USING (is_app_admin()) WITH CHECK (is_app_admin());

-- pending_organizations: submitter sees own row; admins see all
DROP POLICY IF EXISTS "pending_orgs_select"       ON pending_organizations;
DROP POLICY IF EXISTS "pending_orgs_insert_own"   ON pending_organizations;
DROP POLICY IF EXISTS "pending_orgs_update_own"   ON pending_organizations;
DROP POLICY IF EXISTS "pending_orgs_update_admin" ON pending_organizations;

CREATE POLICY "pending_orgs_select" ON pending_organizations
  FOR SELECT USING (auth.uid() = user_id OR is_app_admin());

CREATE POLICY "pending_orgs_insert_own" ON pending_organizations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "pending_orgs_update_own" ON pending_organizations
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "pending_orgs_update_admin" ON pending_organizations
  FOR UPDATE USING (is_app_admin()) WITH CHECK (is_app_admin());

-- organizations: public read; org owners/admins can update their own; app admins can do all
DROP POLICY IF EXISTS "organizations_select"    ON organizations;
DROP POLICY IF EXISTS "organizations_all_admin" ON organizations;
DROP POLICY IF EXISTS "org_owner_update"        ON organizations;

CREATE POLICY "organizations_select" ON organizations
  FOR SELECT USING (true);

CREATE POLICY "org_owner_update" ON organizations
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_id = organizations.id
        AND user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_id = organizations.id
        AND user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "organizations_all_admin" ON organizations
  FOR ALL USING (is_app_admin()) WITH CHECK (is_app_admin());

-- posts: public sees active+published; org members see their org; admins see all
DROP POLICY IF EXISTS "posts_select" ON posts;
DROP POLICY IF EXISTS "posts_insert" ON posts;
DROP POLICY IF EXISTS "posts_update" ON posts;
DROP POLICY IF EXISTS "posts_delete" ON posts;

CREATE POLICY "posts_select" ON posts
  FOR SELECT USING (
    (is_active = true AND status = 'published')
    OR is_org_member(organization_id)
    OR is_app_admin()
  );

CREATE POLICY "posts_insert" ON posts
  FOR INSERT WITH CHECK (is_org_member(organization_id) OR is_app_admin());

CREATE POLICY "posts_update" ON posts
  FOR UPDATE
  USING  (is_org_member(organization_id) OR is_app_admin())
  WITH CHECK (is_org_member(organization_id) OR is_app_admin());

CREATE POLICY "posts_delete" ON posts
  FOR DELETE USING (is_org_member(organization_id) OR is_app_admin());

-- post_occurrences: mirrors parent post visibility
DROP POLICY IF EXISTS "post_occurrences_select" ON post_occurrences;
DROP POLICY IF EXISTS "post_occurrences_insert" ON post_occurrences;
DROP POLICY IF EXISTS "post_occurrences_update" ON post_occurrences;
DROP POLICY IF EXISTS "post_occurrences_delete" ON post_occurrences;

CREATE POLICY "post_occurrences_select" ON post_occurrences
  FOR SELECT USING (
    (
      is_cancelled = false
      AND EXISTS (
        SELECT 1 FROM posts
        WHERE id = post_occurrences.post_id
          AND is_active = true AND status = 'published'
      )
    )
    OR EXISTS (
      SELECT 1 FROM posts p
      JOIN organization_members om ON om.organization_id = p.organization_id
      WHERE p.id = post_occurrences.post_id AND om.user_id = auth.uid()
    )
    OR is_app_admin()
  );

CREATE POLICY "post_occurrences_insert" ON post_occurrences
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM posts p
      JOIN organization_members om ON om.organization_id = p.organization_id
      WHERE p.id = post_occurrences.post_id AND om.user_id = auth.uid()
    )
    OR is_app_admin()
  );

CREATE POLICY "post_occurrences_update" ON post_occurrences
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM posts p
      JOIN organization_members om ON om.organization_id = p.organization_id
      WHERE p.id = post_occurrences.post_id AND om.user_id = auth.uid()
    )
    OR is_app_admin()
  );

CREATE POLICY "post_occurrences_delete" ON post_occurrences
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM posts p
      JOIN organization_members om ON om.organization_id = p.organization_id
      WHERE p.id = post_occurrences.post_id AND om.user_id = auth.uid()
    )
    OR is_app_admin()
  );

-- ============================================================
-- STORAGE
-- Path convention: post-images/{organization_id}/{filename}
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('post-images', 'post-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read post images"          ON storage.objects;
DROP POLICY IF EXISTS "Org members upload to own folder" ON storage.objects;
DROP POLICY IF EXISTS "App admins manage storage"        ON storage.objects;

CREATE POLICY "Public read post images" ON storage.objects
  FOR SELECT USING (bucket_id = 'post-images');

CREATE POLICY "Org members upload to own folder" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'post-images'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] IN (
      SELECT organization_id::text
      FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "App admins manage storage" ON storage.objects
  FOR ALL
  USING  (bucket_id = 'post-images' AND is_app_admin())
  WITH CHECK (bucket_id = 'post-images' AND is_app_admin());

-- ============================================================
-- RPC FUNCTIONS (SECURITY DEFINER)
-- ============================================================

-- Called from /auth/callback after magic-link sign-in.
-- Reads email from auth.users (NOT from client input) to prevent spoofing.
-- Creates org membership if domain matches a verified org, otherwise
-- creates a pending_organizations row and redirects to /organization-request.
CREATE OR REPLACE FUNCTION handle_auth_callback(p_full_name text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_email   text;
  v_domain  text;
  v_org_id  uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT lower(email) INTO v_email FROM auth.users WHERE id = v_user_id;
  v_domain := split_part(v_email, '@', 2);

  INSERT INTO profiles (id, email, full_name)
  VALUES (v_user_id, v_email, p_full_name)
  ON CONFLICT (id) DO UPDATE
    SET email     = EXCLUDED.email,
        full_name = COALESCE(EXCLUDED.full_name, profiles.full_name);

  -- If user already has a membership, they're re-logging in — just return.
  SELECT organization_id INTO v_org_id
  FROM organization_members
  WHERE user_id = v_user_id
  LIMIT 1;

  IF v_org_id IS NOT NULL THEN
    RETURN jsonb_build_object('redirect', '/admin', 'organization_id', v_org_id, 'matched', true);
  END IF;

  -- Check if domain matches a pre-verified organization (e.g. feedingsandiego.org).
  -- Public consumer domains are excluded so each user gets their own isolated org.
  IF v_domain NOT IN ('gmail.com','yahoo.com','hotmail.com','outlook.com','icloud.com','live.com','msn.com','aol.com','protonmail.com') THEN
    SELECT id INTO v_org_id
    FROM organizations
    WHERE domain = v_domain AND is_verified = true
    LIMIT 1;
  END IF;

  IF v_org_id IS NOT NULL THEN
    -- Domain matched a verified org — add as member
    INSERT INTO organization_members (user_id, organization_id, role)
    VALUES (v_user_id, v_org_id, 'member')
    ON CONFLICT (user_id, organization_id) DO NOTHING;
  ELSE
    -- PILOT MODE: create a per-user org with no domain so accounts never share data.
    INSERT INTO organizations (name, domain, is_verified, created_by)
    VALUES (v_email, NULL, true, v_user_id)
    RETURNING id INTO v_org_id;

    INSERT INTO organization_members (user_id, organization_id, role)
    VALUES (v_user_id, v_org_id, 'owner')
    ON CONFLICT (user_id, organization_id) DO NOTHING;
  END IF;

  RETURN jsonb_build_object('redirect', '/admin', 'organization_id', v_org_id, 'matched', true);
END;
$$;

-- App-admin-only: creates/verifies the org and grants the requesting user ownership.
CREATE OR REPLACE FUNCTION approve_pending_org(
  p_pending_id uuid,
  p_org_name   text,
  p_domain     text,
  p_website    text DEFAULT NULL,
  p_phone      text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pending pending_organizations%ROWTYPE;
  v_org_id  uuid;
BEGIN
  IF NOT is_app_admin() THEN
    RAISE EXCEPTION 'Unauthorized: app admin required';
  END IF;

  SELECT * INTO v_pending FROM pending_organizations WHERE id = p_pending_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pending request not found'; END IF;
  IF v_pending.status <> 'pending' THEN
    RAISE EXCEPTION 'Request is already %', v_pending.status;
  END IF;

  INSERT INTO organizations (name, domain, website, phone, is_verified, created_by)
  VALUES (p_org_name, p_domain, p_website, p_phone, true, auth.uid())
  ON CONFLICT (domain) DO UPDATE
    SET is_verified = true,
        name        = EXCLUDED.name,
        website     = COALESCE(EXCLUDED.website, organizations.website),
        phone       = COALESCE(EXCLUDED.phone,   organizations.phone)
  RETURNING id INTO v_org_id;

  INSERT INTO organization_members (user_id, organization_id, role)
  VALUES (v_pending.user_id, v_org_id, 'owner')
  ON CONFLICT (user_id, organization_id) DO UPDATE SET role = 'owner';

  UPDATE pending_organizations
  SET status = 'approved', reviewed_at = timezone('utc', now()), reviewed_by = auth.uid()
  WHERE id = p_pending_id;

  RETURN jsonb_build_object('success', true, 'organization_id', v_org_id);
END;
$$;

-- App-admin-only: marks a pending request as rejected.
CREATE OR REPLACE FUNCTION reject_pending_org(p_pending_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_app_admin() THEN
    RAISE EXCEPTION 'Unauthorized: app admin required';
  END IF;

  UPDATE pending_organizations
  SET status = 'rejected', reviewed_at = timezone('utc', now()), reviewed_by = auth.uid()
  WHERE id = p_pending_id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found or already reviewed';
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ============================================================
-- BOOTSTRAP COMMANDS (run manually after first sign-in)
-- ============================================================
-- Grant app-admin access:
--   INSERT INTO app_admins (user_id)
--   SELECT id FROM auth.users WHERE email = 'you@example.com';
--
-- Add a verified organization domain:
--   INSERT INTO organizations (name, domain, is_verified)
--   VALUES ('Feeding San Diego', 'feedingsandiego.org', true);
