-- supabase/migrations/001_initial_schema.sql

-- PROFILES: one row per user, replaces rp_profile localStorage key
CREATE TABLE profiles (
  id uuid REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  name text,
  pos text,
  grad_year integer CHECK (grad_year BETWEEN 2025 AND 2030),
  hometown text,
  high_school text,
  gpa numeric CHECK (gpa >= 0 AND gpa <= 4),
  sat_act text,
  stats text,
  film_url text,
  email text,
  target_divs text[] DEFAULT '{}',
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_own" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE USING (auth.uid() = id);

-- EMAILS: many rows per user, replaces rp_emails localStorage key
CREATE TABLE emails (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  school_id text NOT NULL,
  school_name text NOT NULL,
  type text NOT NULL CHECK (type IN ('first','followup','thankyou','showcase','autopilot')),
  subject text NOT NULL,
  body text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX emails_user_id_created_at ON emails (user_id, created_at DESC);
ALTER TABLE emails ENABLE ROW LEVEL SECURITY;
CREATE POLICY "emails_select_own" ON emails FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "emails_insert_own" ON emails FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "emails_delete_own" ON emails FOR DELETE USING (auth.uid() = user_id);

-- SUBSCRIPTIONS: one row per user, written by webhook via service role
CREATE TABLE subscriptions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL UNIQUE,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text NOT NULL DEFAULT 'none',
  current_period_end timestamptz,
  grace_until timestamptz,
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
-- Users can only SELECT their own row; INSERT/UPDATE done via service role
CREATE POLICY "subscriptions_select_own" ON subscriptions FOR SELECT USING (auth.uid() = user_id);

-- AI_USAGE: rate limiting for ai-proxy, written by service role
CREATE TABLE ai_usage (
  user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  date date NOT NULL DEFAULT current_date,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, date)
);
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;
-- No user-facing policies; only accessed via service role from ai-proxy function
