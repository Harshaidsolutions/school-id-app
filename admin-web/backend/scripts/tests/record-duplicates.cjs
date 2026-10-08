const {PGlite}=require('@electric-sql/pglite'); const fs=require('fs'); const assert=require('node:assert/strict');
(async()=>{
 const db=new PGlite();
 await db.exec(`CREATE TABLE students(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),school_id uuid,institute_id uuid,student_name text,class_section text,parent_name text,parent_phone text,address text,roll_no text,dob date,gender text,blood_group text,custom_1 text,custom_2 text,custom_3 text,extra_fields jsonb,field_labels jsonb,photo_id text,photo_url text);
 CREATE TABLE organization_submissions(id uuid PRIMARY KEY, organization_id uuid);
 CREATE TABLE organization_form_fields(id uuid PRIMARY KEY,field_name text,enabled boolean,field_type text);
 CREATE TABLE organization_submission_values(submission_id uuid,field_id uuid,text_value text,photo_url text);`);
 const sql=fs.readFileSync(require('path').join(__dirname,'../sql/record-duplicates.sql'),'utf8');await db.exec(sql);await db.exec(sql);
 const a='00000000-0000-0000-0000-000000000001',b='00000000-0000-0000-0000-000000000002',f='00000000-0000-0000-0000-000000000003',g='00000000-0000-0000-0000-000000000004',r='00000000-0000-0000-0000-000000000005',r2='00000000-0000-0000-0000-000000000006';
 const add=(school,name,phone,photo)=>db.query('INSERT INTO students(school_id,student_name,parent_phone,photo_id) VALUES($1,$2,$3,$4)',[school,name,phone,photo]);
 await add(a,'Asha Rao','123','ADD_001');
 await assert.rejects(add(a,'  ASHA   Rao ','123','ADD_002'), e=>e.constraint==='duplicate_record_details');
 await add(a,'Asha Rao','456','ADD_003');await add(b,'Asha Rao','123','ADD_001');
 await db.query("UPDATE students SET photo_url='new.jpg',photo_id='CUSTOM' WHERE school_id=$1 AND parent_phone='123'",[a]);
 await assert.rejects(db.query("UPDATE students SET parent_phone='123' WHERE school_id=$1 AND parent_phone='456'",[a]),e=>e.constraint==='duplicate_record_details');
 // Institute scope and custom fields are part of matching.
 await db.query("INSERT INTO students(institute_id,student_name,extra_fields) VALUES($1,'Asha', '{\"department\":\"A\"}')",[a]);
 await db.query("INSERT INTO students(institute_id,student_name,extra_fields) VALUES($1,'Asha', '{\"department\":\"B\"}')",[a]);
 await assert.rejects(db.query("INSERT INTO students(institute_id,student_name,extra_fields) VALUES($1,'asha', '{\"department\":\"a\"}')",[a]),e=>e.constraint==='duplicate_record_details');
 await db.query('INSERT INTO organization_form_fields VALUES($1,\'Name\',true,\'text\'),($2,\'Department\',true,\'text\')',[f,g]);
 async function org(id,org,dept){try{await db.exec('BEGIN');await db.query('INSERT INTO organization_submissions VALUES($1,$2)',[id,org]);await db.query('INSERT INTO organization_submission_values VALUES($1,$2,\'Asha\',null),($1,$3,$4,null)',[id,f,g,dept]);await db.exec('COMMIT');}catch(e){await db.exec('ROLLBACK');throw e;}}
 await org(r,a,'Operations');await assert.rejects(org(r2,a,' operations '),e=>e.constraint==='duplicate_record_details');
 await org(r2,b,'Operations');
 await db.query("UPDATE organization_submission_values SET photo_url='replacement' WHERE submission_id=$1",[r]);
 await db.exec('BEGIN');await db.query("UPDATE organization_submission_values SET text_value='New department' WHERE submission_id=$1 AND field_id=$2",[r,g]);await db.exec('COMMIT');
 await db.exec("BEGIN; SELECT set_config('app.admin_excel_import', 'on', true)");
 await add(a,'Asha Rao','123','EXCEL_002');
 await db.exec('COMMIT');
 await assert.rejects(add(a,'Asha Rao','123','MANUAL_003'), e=>e.constraint==='duplicate_record_details');
 console.log('PASS duplicate SQL: idempotent migration, normalized equality, scope, different details, update collision, photo edits, organization transaction rollback');await db.close();
})().catch(e=>{console.error(e);process.exit(1)});
