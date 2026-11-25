-- Minimal base tables for CI / local integration tests.
-- The app's migrate script only ALTERs users/schools/students (they were first
-- created outside this repo), so a fresh database needs them to exist before
-- `npm run migrate` adds the remaining columns. Columns here are the core ones
-- migrate does not add; everything else is filled in by migrate (ADD COLUMN IF NOT EXISTS).
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  password_hash text,
  role text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS schools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  school_code text,
  address text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid,
  student_name text,
  parent_name text,
  parent_phone text,
  roll_no text,
  status text DEFAULT 'pending',
  printed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
