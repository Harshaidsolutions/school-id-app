import "dotenv/config";
import { pool } from "../src/config/database";

async function migrate() {
  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

    -- Schools: extra fields for admin form + year filtering
    ALTER TABLE schools ADD COLUMN IF NOT EXISTS year TEXT;
    ALTER TABLE schools ADD COLUMN IF NOT EXISTS instructions TEXT;
    ALTER TABLE schools ADD COLUMN IF NOT EXISTS logo_url TEXT;
    ALTER TABLE schools ADD COLUMN IF NOT EXISTS signature_url TEXT;

    -- Institutes (separate client type from schools)
    CREATE TABLE IF NOT EXISTS institutes (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name TEXT NOT NULL,
      year TEXT,
      phone TEXT,
      institute_code TEXT,
      address TEXT,
      instructions TEXT,
      logo_url TEXT,
      signature_url TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Notifications
    CREATE TABLE IF NOT EXISTS notifications (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      created_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Optional teacher notification read tracking
    CREATE TABLE IF NOT EXISTS notification_reads (
      notification_id UUID REFERENCES notifications(id) ON DELETE CASCADE,
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      read_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (notification_id, user_id)
    );

    -- Ensure templates orientation values are constrained softly (no CHECK to avoid breaking existing rows)
    CREATE INDEX IF NOT EXISTS idx_templates_school_orientation
      ON templates (school_id, orientation);

    CREATE INDEX IF NOT EXISTS idx_notifications_school_created
      ON notifications (school_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_students_school_status
      ON students (school_id, status);

    -- Password reset OTPs (forgot-password flow)
    CREATE TABLE IF NOT EXISTS password_reset_otps (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      otp_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      consumed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_password_reset_otps_email
      ON password_reset_otps (lower(email), created_at DESC);

    -- Short-lived reset tokens issued after OTP verification
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      consumed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_hash
      ON password_reset_tokens (token_hash);

    -- Teacher/institute owner login by username (email remains required for admins)
    ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_unique
      ON users (lower(username))
      WHERE username IS NOT NULL;

    -- Teacher class + section assignment (used by login JWT and teacher scoping)
    ALTER TABLE users ADD COLUMN IF NOT EXISTS assigned_class TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS assigned_section TEXT;

    -- Institute staff ownership link
    ALTER TABLE users ADD COLUMN IF NOT EXISTS institute_id UUID
      REFERENCES institutes(id) ON DELETE CASCADE;

    -- Allow institute_staff role
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
    ALTER TABLE users ADD CONSTRAINT users_role_check
      CHECK (role = ANY (ARRAY['admin'::text, 'teacher'::text, 'institute_staff'::text]));

    ALTER TABLE schools ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
    ALTER TABLE institutes ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

    -- Teacher Organization Details (Screen 12)
    ALTER TABLE schools ADD COLUMN IF NOT EXISTS organization_photo_url TEXT;
    ALTER TABLE institutes ADD COLUMN IF NOT EXISTS organization_photo_url TEXT;
    ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS extra_image_urls JSONB NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE schools ADD COLUMN IF NOT EXISTS model TEXT;
    ALTER TABLE schools ADD COLUMN IF NOT EXISTS tags TEXT;
    ALTER TABLE schools ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES templates(id);
    ALTER TABLE schools ADD COLUMN IF NOT EXISTS phone2 TEXT;

    -- Institute organization selections (same shape as schools)
    ALTER TABLE institutes ADD COLUMN IF NOT EXISTS model TEXT;
    ALTER TABLE institutes ADD COLUMN IF NOT EXISTS tags TEXT;
    ALTER TABLE institutes ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES templates(id);

    -- School's own student photo reference ID (not the captured photo_url)
    ALTER TABLE students ADD COLUMN IF NOT EXISTS photo_id TEXT;
  `);

  // Real-world Excel mapping: combined class_section, student_name, parent_phone, address
  await pool.query(`
    DO $migrate$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'students' AND column_name = 'name'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'students' AND column_name = 'student_name'
      ) THEN
        ALTER TABLE students RENAME COLUMN name TO student_name;
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'students' AND column_name = 'phone_number'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'students' AND column_name = 'parent_phone'
      ) THEN
        ALTER TABLE students RENAME COLUMN phone_number TO parent_phone;
      END IF;
    END
    $migrate$;

    ALTER TABLE students ADD COLUMN IF NOT EXISTS photo_id TEXT;
    ALTER TABLE students ADD COLUMN IF NOT EXISTS address TEXT;
    ALTER TABLE students ADD COLUMN IF NOT EXISTS class_section TEXT;

    DO $migrate$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'students' AND column_name = 'class'
      ) THEN
        UPDATE students
        SET class_section = TRIM(BOTH FROM
          CASE
            WHEN section IS NULL OR TRIM(section) = '' THEN class
            ELSE class || ' ' || section
          END
        )
        WHERE class_section IS NULL OR TRIM(class_section) = '';
      END IF;
    END
    $migrate$;

    UPDATE students
    SET photo_id = 'LEGACY-' || REPLACE(id::text, '-', '')
    WHERE photo_id IS NULL OR TRIM(photo_id) = '';

    ALTER TABLE students DROP CONSTRAINT IF EXISTS students_school_id_class_section_roll_no_key;
    DROP INDEX IF EXISTS students_school_id_class_section_roll_no_key;
    DROP INDEX IF EXISTS idx_students_class_section;

    ALTER TABLE students ALTER COLUMN roll_no DROP NOT NULL;

    ALTER TABLE students DROP COLUMN IF EXISTS section;
    ALTER TABLE students DROP COLUMN IF EXISTS dob;
    ALTER TABLE students DROP COLUMN IF EXISTS aadhar_or_pen_id;
    ALTER TABLE students DROP COLUMN IF EXISTS class;

    UPDATE students
    SET class_section = 'UNKNOWN'
    WHERE class_section IS NULL OR TRIM(class_section) = '';

    UPDATE students
    SET student_name = 'UNKNOWN'
    WHERE student_name IS NULL OR TRIM(student_name) = '';

    ALTER TABLE students ALTER COLUMN class_section SET NOT NULL;
    ALTER TABLE students ALTER COLUMN student_name SET NOT NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS students_school_class_section_photo_id_key
      ON students (school_id, class_section, photo_id);

    CREATE INDEX IF NOT EXISTS idx_students_school_class_section
      ON students (school_id, class_section);
  `);

  await pool.query(`
    -- OTPs for admin school-delete confirmation (mirrors password-reset OTP pattern)
    CREATE TABLE IF NOT EXISTS school_delete_otps (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      admin_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      otp_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      consumed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_school_delete_otps_school_admin
      ON school_delete_otps (school_id, admin_user_id, created_at DESC);

    -- Plain-text password for admin display (teacher / institute owner accounts)
    ALTER TABLE users ADD COLUMN IF NOT EXISTS password_plain TEXT;

    -- Generic admin OTP confirmations (student delete, excel delete, etc.)
    CREATE TABLE IF NOT EXISTS admin_action_otps (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      admin_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      action_type TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      email TEXT NOT NULL,
      otp_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      consumed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_admin_action_otps_lookup
      ON admin_action_otps (admin_user_id, action_type, resource_id, created_at DESC);
  `);

  await pool.query(`
    ALTER TABLE notifications ADD COLUMN IF NOT EXISTS institute_id UUID
      REFERENCES institutes(id) ON DELETE CASCADE;

    ALTER TABLE notifications ALTER COLUMN school_id DROP NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_notifications_institute_created
      ON notifications (institute_id, created_at DESC);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS notification_deletes (
      notification_id UUID REFERENCES notifications(id) ON DELETE CASCADE,
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      deleted_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (notification_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_notification_deletes_user
      ON notification_deletes (user_id, notification_id);
  `);

  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_url TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT false;

    ALTER TABLE schools ADD COLUMN IF NOT EXISTS owner_admin_id UUID REFERENCES users(id);
    ALTER TABLE institutes ADD COLUMN IF NOT EXISTS owner_admin_id UUID REFERENCES users(id);

    CREATE INDEX IF NOT EXISTS idx_schools_owner_admin ON schools (owner_admin_id);
    CREATE INDEX IF NOT EXISTS idx_institutes_owner_admin ON institutes (owner_admin_id);

    UPDATE users
    SET is_super_admin = true
    WHERE role = 'admin'
      AND (
        lower(email) = 'harshaidsolutions@gmail.com'
        OR is_super_admin IS TRUE
      );

    UPDATE schools s
    SET owner_admin_id = u.id
    FROM users u
    WHERE s.owner_admin_id IS NULL
      AND u.role = 'admin'
      AND u.is_super_admin = true
      AND lower(u.email) = 'harshaidsolutions@gmail.com';

    UPDATE institutes i
    SET owner_admin_id = u.id
    FROM users u
    WHERE i.owner_admin_id IS NULL
      AND u.role = 'admin'
      AND u.is_super_admin = true
      AND lower(u.email) = 'harshaidsolutions@gmail.com';
  `);

  // Templates are global (shared by all schools / teachers)
  await pool.query(`
    ALTER TABLE templates ALTER COLUMN school_id DROP NOT NULL;
    UPDATE templates SET school_id = NULL WHERE school_id IS NOT NULL;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS catalog_items (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      kind TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      image_url TEXT,
      file_size INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_catalog_items_kind_created
      ON catalog_items (kind, created_at DESC);

    UPDATE catalog_items SET kind = 'model'
      WHERE kind IN ('models', 'id_card_model', 'id_card_models');
    UPDATE catalog_items SET kind = 'tag'
      WHERE kind IN ('tags', 'id_card_tag', 'id_card_tags');
  `);

  await pool.query(`
    ALTER TABLE schools ADD COLUMN IF NOT EXISTS owner_password_plain TEXT;
    ALTER TABLE institutes ADD COLUMN IF NOT EXISTS owner_password_plain TEXT;
    ALTER TABLE schools ADD COLUMN IF NOT EXISTS owner_username_plain TEXT;
    ALTER TABLE institutes ADD COLUMN IF NOT EXISTS owner_username_plain TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS is_owner BOOLEAN DEFAULT false;

    -- Ensure each school/institute has one flagged owner user when linked accounts exist
    WITH schools_needing_owner AS (
      SELECT s.id AS school_id
      FROM schools s
      WHERE EXISTS (SELECT 1 FROM users u WHERE u.school_id = s.id)
        AND NOT EXISTS (
          SELECT 1 FROM users u
          WHERE u.school_id = s.id AND COALESCE(u.is_owner, false) = true
        )
    ),
    first_school_user AS (
      SELECT DISTINCT ON (u.school_id) u.id
      FROM users u
      INNER JOIN schools_needing_owner sne ON sne.school_id = u.school_id
      ORDER BY u.school_id, u.created_at ASC NULLS LAST
    )
    UPDATE users u
    SET is_owner = true
    FROM first_school_user fsu
    WHERE u.id = fsu.id;

    WITH institutes_needing_owner AS (
      SELECT i.id AS institute_id
      FROM institutes i
      WHERE EXISTS (SELECT 1 FROM users u WHERE u.institute_id = i.id)
        AND NOT EXISTS (
          SELECT 1 FROM users u
          WHERE u.institute_id = i.id AND COALESCE(u.is_owner, false) = true
        )
    ),
    first_institute_user AS (
      SELECT DISTINCT ON (u.institute_id) u.id
      FROM users u
      INNER JOIN institutes_needing_owner ine ON ine.institute_id = u.institute_id
      ORDER BY u.institute_id, u.created_at ASC NULLS LAST
    )
    UPDATE users u
    SET is_owner = true
    FROM first_institute_user fiu
    WHERE u.id = fiu.id;

    UPDATE schools s
    SET owner_password_plain = sub.password_plain
    FROM (
      SELECT DISTINCT ON (u.school_id) u.school_id, u.password_plain
      FROM users u
      WHERE u.school_id IS NOT NULL
        AND u.password_plain IS NOT NULL
        AND TRIM(u.password_plain) <> ''
      ORDER BY u.school_id,
               COALESCE(u.is_owner, false) DESC,
               u.created_at ASC NULLS LAST
    ) sub
    WHERE s.id = sub.school_id
      AND (s.owner_password_plain IS NULL OR TRIM(s.owner_password_plain) = '');

    UPDATE institutes i
    SET owner_password_plain = sub.password_plain
    FROM (
      SELECT DISTINCT ON (u.institute_id) u.institute_id, u.password_plain
      FROM users u
      WHERE u.institute_id IS NOT NULL
        AND u.password_plain IS NOT NULL
        AND TRIM(u.password_plain) <> ''
      ORDER BY u.institute_id,
               COALESCE(u.is_owner, false) DESC,
               u.created_at ASC NULLS LAST
    ) sub
    WHERE i.id = sub.institute_id
      AND (i.owner_password_plain IS NULL OR TRIM(i.owner_password_plain) = '');

    UPDATE schools s
    SET owner_username_plain = sub.display_username
    FROM (
      SELECT DISTINCT ON (u.school_id)
        u.school_id,
        COALESCE(
          NULLIF(TRIM(u.username), ''),
          CASE
            WHEN u.email IS NOT NULL AND position('@' in u.email) > 0
            THEN split_part(u.email, '@', 1)
            ELSE NULL
          END
        ) AS display_username
      FROM users u
      WHERE u.school_id IS NOT NULL
      ORDER BY u.school_id,
               COALESCE(u.is_owner, false) DESC,
               (NULLIF(TRIM(u.username), '') IS NOT NULL) DESC,
               u.created_at ASC NULLS LAST
    ) sub
    WHERE s.id = sub.school_id
      AND sub.display_username IS NOT NULL
      AND (s.owner_username_plain IS NULL OR TRIM(s.owner_username_plain) = '');

    UPDATE institutes i
    SET owner_username_plain = sub.display_username
    FROM (
      SELECT DISTINCT ON (u.institute_id)
        u.institute_id,
        COALESCE(
          NULLIF(TRIM(u.username), ''),
          CASE
            WHEN u.email IS NOT NULL AND position('@' in u.email) > 0
            THEN split_part(u.email, '@', 1)
            ELSE NULL
          END
        ) AS display_username
      FROM users u
      WHERE u.institute_id IS NOT NULL
      ORDER BY u.institute_id,
               COALESCE(u.is_owner, false) DESC,
               (NULLIF(TRIM(u.username), '') IS NOT NULL) DESC,
               u.created_at ASC NULLS LAST
    ) sub
    WHERE i.id = sub.institute_id
      AND sub.display_username IS NOT NULL
      AND (i.owner_username_plain IS NULL OR TRIM(i.owner_username_plain) = '');

    CREATE TABLE IF NOT EXISTS form_configs (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
      institute_id UUID REFERENCES institutes(id) ON DELETE CASCADE,
      fields JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT form_configs_one_org CHECK (
        (school_id IS NOT NULL AND institute_id IS NULL) OR
        (school_id IS NULL AND institute_id IS NOT NULL)
      )
    );
    CREATE UNIQUE INDEX IF NOT EXISTS form_configs_school_unique
      ON form_configs (school_id) WHERE school_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS form_configs_institute_unique
      ON form_configs (institute_id) WHERE institute_id IS NOT NULL;

    ALTER TABLE students ADD COLUMN IF NOT EXISTS custom_1 TEXT;
    ALTER TABLE students ADD COLUMN IF NOT EXISTS custom_2 TEXT;
    ALTER TABLE students ADD COLUMN IF NOT EXISTS custom_3 TEXT;
    ALTER TABLE students ADD COLUMN IF NOT EXISTS institute_id UUID
      REFERENCES institutes(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_students_institute_id ON students (institute_id);

    ALTER TABLE students ADD COLUMN IF NOT EXISTS dob DATE;
    ALTER TABLE students ADD COLUMN IF NOT EXISTS gender TEXT;
    ALTER TABLE students ADD COLUMN IF NOT EXISTS blood_group TEXT;

    ALTER TABLE import_batches ADD COLUMN IF NOT EXISTS excel_headers JSONB;
    ALTER TABLE import_batches ADD COLUMN IF NOT EXISTS excel_schema JSONB;
    ALTER TABLE import_batches ADD COLUMN IF NOT EXISTS institute_id UUID
      REFERENCES institutes(id) ON DELETE CASCADE;

    ALTER TABLE students ADD COLUMN IF NOT EXISTS extra_fields JSONB NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE students ADD COLUMN IF NOT EXISTS field_labels JSONB;
    ALTER TABLE students ADD COLUMN IF NOT EXISTS photo_captured_at TIMESTAMPTZ;

    UPDATE students
    SET photo_captured_at = updated_at
    WHERE photo_url IS NOT NULL
      AND photo_captured_at IS NULL
      AND updated_at IS NOT NULL;
  `);

  // Allow staff_id template orientation (drop legacy CHECK / extend enum if present)
  await pool.query(`
    DO $orient$
    DECLARE r record;
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'template_orientation') THEN
        BEGIN
          ALTER TYPE template_orientation ADD VALUE 'staff_id';
        EXCEPTION WHEN duplicate_object THEN
          NULL;
        END;
      END IF;

      FOR r IN
        SELECT c.conname
        FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        WHERE t.relname = 'templates'
          AND c.contype = 'c'
          AND pg_get_constraintdef(c.oid) ILIKE '%orientation%'
      LOOP
        EXECUTE format('ALTER TABLE templates DROP CONSTRAINT IF EXISTS %I', r.conname);
      END LOOP;
    END
    $orient$;
  `);

  console.log("Backfilling form_configs from existing imported students...");
  const { ensureFormConfigForOrg } = await import(
    "../src/controllers/formConfigController"
  );

  const schoolsWithStudents = await pool.query<{ school_id: string }>(
    `SELECT DISTINCT school_id::text AS school_id
     FROM students
     WHERE school_id IS NOT NULL`
  );
  for (const row of schoolsWithStudents.rows) {
    const fields = await ensureFormConfigForOrg({ schoolId: row.school_id });
    console.log(`  school ${row.school_id}: ${fields.length} form field(s)`);
  }

  const institutesWithStudents = await pool.query<{ institute_id: string }>(
    `SELECT DISTINCT institute_id::text AS institute_id
     FROM students
     WHERE institute_id IS NOT NULL`
  );
  for (const row of institutesWithStudents.rows) {
    const fields = await ensureFormConfigForOrg({ instituteId: row.institute_id });
    console.log(`  institute ${row.institute_id}: ${fields.length} form field(s)`);
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS teacher_push_tokens (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
      institute_id UUID REFERENCES institutes(id) ON DELETE CASCADE,
      push_token TEXT NOT NULL UNIQUE,
      platform TEXT DEFAULT 'android',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_teacher_push_tokens_school
      ON teacher_push_tokens (school_id);
    CREATE INDEX IF NOT EXISTS idx_teacher_push_tokens_institute
      ON teacher_push_tokens (institute_id);
  `);

  await pool.query(`
    ALTER TABLE teacher_push_tokens
      ADD COLUMN IF NOT EXISTS sns_endpoint_arn TEXT,
      ADD COLUMN IF NOT EXISTS device_id TEXT,
      ADD COLUMN IF NOT EXISTS device_name TEXT,
      ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_teacher_push_tokens_sns_endpoint
      ON teacher_push_tokens (sns_endpoint_arn)
      WHERE sns_endpoint_arn IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_teacher_push_tokens_active_school
      ON teacher_push_tokens (school_id)
      WHERE is_active = true AND sns_endpoint_arn IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_teacher_push_tokens_active_institute
      ON teacher_push_tokens (institute_id)
      WHERE is_active = true AND sns_endpoint_arn IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_teacher_push_tokens_device
      ON teacher_push_tokens (device_id)
      WHERE device_id IS NOT NULL;
  `);

  await pool.query(`
    ALTER TABLE institutes ADD COLUMN IF NOT EXISTS photo_capture_seq INTEGER NOT NULL DEFAULT 0;

    UPDATE institutes i
    SET photo_capture_seq = GREATEST(
      COALESCE(i.photo_capture_seq, 0),
      COALESCE(
        (
          SELECT MAX((regexp_match(s.photo_id, '^ADD_([0-9]+)$'))[1]::integer)
          FROM students s
          WHERE s.institute_id = i.id
        ),
        0
      )
    );
  `);

  await pool.query(`
    ALTER TABLE schools ADD COLUMN IF NOT EXISTS photo_capture_seq INTEGER NOT NULL DEFAULT 0;

    UPDATE schools sc
    SET photo_capture_seq = GREATEST(
      COALESCE(sc.photo_capture_seq, 0),
      COALESCE(
        (
          SELECT MAX((regexp_match(s.photo_id, '^ADD_([0-9]+)$'))[1]::integer)
          FROM students s
          WHERE s.school_id = sc.id
        ),
        0
      )
    );

    ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

    UPDATE users
    SET is_active = true
    WHERE role = 'admin' AND is_active IS NULL;

    UPDATE users
    SET is_super_admin = true
    WHERE role = 'admin'
      AND (
        lower(trim(email)) = 'harshaidsolutions@gmail.com'
        OR lower(trim(email)) LIKE '%harshaidsolutions%'
        OR lower(trim(COALESCE(username, ''))) IN (
          'harsha',
          'harshaidsolutions',
          'harshaid',
          'harshaidsolutions@gmail.com'
        )
        OR lower(trim(COALESCE(username, ''))) LIKE '%harshaid%'
      );

    UPDATE users
    SET is_super_admin = true
    WHERE id = (
      SELECT id FROM users
      WHERE role = 'admin'
      ORDER BY created_at ASC NULLS LAST
      LIMIT 1
    );

    UPDATE schools s
    SET owner_admin_id = super.id
    FROM (
      SELECT id FROM users
      WHERE role = 'admin' AND is_super_admin = true
      ORDER BY created_at ASC NULLS LAST
      LIMIT 1
    ) super
    WHERE s.owner_admin_id IS NULL;

    UPDATE institutes i
    SET owner_admin_id = super.id
    FROM (
      SELECT id FROM users
      WHERE role = 'admin' AND is_super_admin = true
      ORDER BY created_at ASC NULLS LAST
      LIMIT 1
    ) super
    WHERE i.owner_admin_id IS NULL;
  `);

  await pool.query(`
    ALTER TABLE templates ADD COLUMN IF NOT EXISTS owner_admin_id UUID REFERENCES users(id);
    ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS owner_admin_id UUID REFERENCES users(id);

    CREATE INDEX IF NOT EXISTS idx_templates_owner_admin ON templates (owner_admin_id);
    CREATE INDEX IF NOT EXISTS idx_catalog_items_owner_admin ON catalog_items (owner_admin_id);

    ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS facebook_url TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS instagram_url TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS youtube_url TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS about_us TEXT;

    UPDATE templates t
    SET owner_admin_id = super.id
    FROM (
      SELECT id FROM users
      WHERE role = 'admin' AND is_super_admin = true
      ORDER BY created_at ASC NULLS LAST
      LIMIT 1
    ) super
    WHERE t.owner_admin_id IS NULL;

    UPDATE catalog_items c
    SET owner_admin_id = super.id
    FROM (
      SELECT id FROM users
      WHERE role = 'admin' AND is_super_admin = true
      ORDER BY created_at ASC NULLS LAST
      LIMIT 1
    ) super
    WHERE c.owner_admin_id IS NULL;

    ALTER TABLE schools ADD COLUMN IF NOT EXISTS allow_screenshot BOOLEAN NOT NULL DEFAULT true;
    ALTER TABLE schools ADD COLUMN IF NOT EXISTS allow_screen_recording BOOLEAN NOT NULL DEFAULT true;
    ALTER TABLE institutes ADD COLUMN IF NOT EXISTS allow_screenshot BOOLEAN NOT NULL DEFAULT true;
    ALTER TABLE institutes ADD COLUMN IF NOT EXISTS allow_screen_recording BOOLEAN NOT NULL DEFAULT true;

    ALTER TABLE schools ADD COLUMN IF NOT EXISTS show_captured_section BOOLEAN NOT NULL DEFAULT true;
    ALTER TABLE schools ADD COLUMN IF NOT EXISTS allow_number_edit BOOLEAN NOT NULL DEFAULT true;
    ALTER TABLE schools ADD COLUMN IF NOT EXISTS field_visibility JSONB NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE institutes ADD COLUMN IF NOT EXISTS show_captured_section BOOLEAN NOT NULL DEFAULT true;
    ALTER TABLE institutes ADD COLUMN IF NOT EXISTS allow_number_edit BOOLEAN NOT NULL DEFAULT true;
    ALTER TABLE institutes ADD COLUMN IF NOT EXISTS field_visibility JSONB NOT NULL DEFAULT '{}'::jsonb;

    ALTER TABLE students ADD COLUMN IF NOT EXISTS signature_url TEXT;
    ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS video_url TEXT;
    ALTER TABLE notifications ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'org';
    CREATE UNIQUE INDEX IF NOT EXISTS notifications_super_school_created_uidx
      ON notifications (school_id)
      WHERE audience = 'super_admin' AND school_id IS NOT NULL;
  `);

  console.log("Migration completed successfully.");
}

migrate()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error("Migration failed:", error);
    await pool.end();
    process.exit(1);
  });
