-- Reject repeated entered details, scoped to the owning school/institute/organization.
-- Photos, generated photo numbers, timestamps and status do not identify a person.
-- Existing duplicates are retained; photo/status-only edits remain possible.
CREATE OR REPLACE FUNCTION record_normalize(value text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
 SELECT lower(regexp_replace(btrim(COALESCE(value, '')), '[[:space:]]+', ' ', 'g'));
$$;
CREATE OR REPLACE FUNCTION student_record_details(r jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
 SELECT COALESCE(jsonb_object_agg(k, v) FILTER (WHERE v <> ''), '{}'::jsonb)
 FROM (
   SELECT key AS k, record_normalize(value) AS v
   FROM jsonb_each_text(jsonb_build_object(
     'student_name', r->>'student_name', 'class_section', r->>'class_section',
     'parent_name', r->>'parent_name', 'parent_phone', r->>'parent_phone',
     'address', r->>'address', 'roll_no', r->>'roll_no', 'dob', r->>'dob',
     'gender', r->>'gender', 'blood_group', r->>'blood_group',
     'custom_1', r->>'custom_1', 'custom_2', r->>'custom_2', 'custom_3', r->>'custom_3'))
   UNION ALL
   SELECT 'extra:' || key, record_normalize(value)
   FROM jsonb_each_text(CASE WHEN jsonb_typeof(r->'extra_fields') = 'object' THEN r->'extra_fields' ELSE '{}'::jsonb END)
   WHERE key NOT IN ('photo_id','student_name','class_section','parent_name','parent_phone','address','roll_no','dob','gender','blood_group','custom_1','custom_2','custom_3','photo_url','signature_url')
     AND regexp_replace(lower(COALESCE(r->'field_labels'->>key, key)), '[^a-z0-9]', '', 'g') NOT IN ('id','photoid','photonumber','photono','photoidnumber','photo','uploadphoto','signature')
 ) details;
$$;
CREATE OR REPLACE FUNCTION reject_duplicate_student_details() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE details jsonb;
BEGIN
 IF current_setting('app.admin_excel_import', true) = 'on' THEN RETURN NEW; END IF;
 details := student_record_details(to_jsonb(NEW));
 IF details = '{}'::jsonb THEN RETURN NEW; END IF;
 IF TG_OP = 'UPDATE' THEN
   IF details = student_record_details(to_jsonb(OLD))
      AND NEW.school_id IS NOT DISTINCT FROM OLD.school_id
      AND NEW.institute_id IS NOT DISTINCT FROM OLD.institute_id THEN RETURN NEW; END IF;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('record:' || COALESCE(NEW.school_id::text, NEW.institute_id::text), 0));
 IF EXISTS (SELECT 1 FROM students s WHERE s.id <> NEW.id
     AND s.school_id IS NOT DISTINCT FROM NEW.school_id
     AND s.institute_id IS NOT DISTINCT FROM NEW.institute_id
     AND student_record_details(to_jsonb(s)) = details) THEN
   RAISE EXCEPTION 'Data already exists. Please contact admin.' USING ERRCODE='23505', CONSTRAINT='duplicate_record_details';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS check_student_duplicate_details ON students;
CREATE TRIGGER check_student_duplicate_details BEFORE INSERT OR UPDATE ON students
FOR EACH ROW EXECUTE FUNCTION reject_duplicate_student_details();

CREATE OR REPLACE FUNCTION organization_record_details(record_id uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
 SELECT COALESCE(jsonb_object_agg(f.id::text, record_normalize(v.text_value))
   FILTER (WHERE record_normalize(v.text_value) <> ''), '{}'::jsonb)
 FROM organization_submission_values v JOIN organization_form_fields f ON f.id=v.field_id
 WHERE v.submission_id=record_id AND f.enabled=true AND f.field_type='text'
   AND regexp_replace(lower(f.field_name), '[^a-z0-9]', '', 'g') NOT IN ('id','photoid','photonumber','photono','photoidnumber');
$$;
CREATE OR REPLACE FUNCTION reject_duplicate_organization_details() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE org_id uuid; details jsonb;
BEGIN
 IF TG_OP = 'UPDATE' THEN
   IF record_normalize(NEW.text_value) = record_normalize(OLD.text_value) THEN RETURN NEW; END IF;
 END IF;
 SELECT organization_id INTO org_id FROM organization_submissions WHERE id=NEW.submission_id;
 IF org_id IS NULL THEN RETURN NEW; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('record:' || org_id::text, 0));
 details := organization_record_details(NEW.submission_id);
 IF details = '{}'::jsonb THEN RETURN NEW; END IF;
 IF EXISTS (SELECT 1 FROM organization_submissions s WHERE s.organization_id=org_id
   AND s.id <> NEW.submission_id AND organization_record_details(s.id)=details) THEN
   RAISE EXCEPTION 'Data already exists. Please contact admin.' USING ERRCODE='23505', CONSTRAINT='duplicate_record_details';
 END IF;
 RETURN NEW;
END $$;
-- Check only at commit, when all configured field values have been written.
DROP TRIGGER IF EXISTS check_organization_duplicate_details ON organization_submission_values;
CREATE CONSTRAINT TRIGGER check_organization_duplicate_details AFTER INSERT OR UPDATE ON organization_submission_values
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reject_duplicate_organization_details();
