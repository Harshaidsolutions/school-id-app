const {test}=require('node:test');
const assert=require('node:assert/strict');
const bcrypt=require('bcrypt');
const {pool}=require('../dist/config/database');
const {login}=require('../dist/controllers/authController');
const {updateOrganizationAppSubmission,replaceOrganizationSubmissionPhoto}=require('../dist/controllers/organizationPortalController');

for (const role of ['teacher','institute_staff','organization_staff']) {
 test(`mobile login selects ${role} instead of an admin with the same credentials`,async()=>{
  process.env.JWT_SECRET='test-only-secret';
  const hash=await bcrypt.hash('Example-password',4), original=pool.query;
  const base={email:'shared@example.test',username:'shared',password_hash:hash,is_active:true,is_super_admin:false,school_id:null,institute_id:null,organization_id:null};
  pool.query=async()=>({rows:[{...base,id:'admin',role:'admin'},{...base,id:'staff',role,school_id:role==='teacher'?'school':null,institute_id:role==='institute_staff'?'institute':null,organization_id:role==='organization_staff'?'org':null,school_is_active:true,institute_is_active:true,organization_is_active:true}]});
  try {
   let payload,error; const res={status(){return this},json(value){payload=value}};
   await login({body:{email:'shared',password:'Example-password',audience:'mobile'}},res,e=>error=e);
   assert.equal(error,undefined); assert.equal(payload.user.role,role); assert.equal(payload.user.id,'staff'); assert.ok(payload.token);
  }finally{pool.query=original;}
 });
}
test('mobile audience cannot authenticate using an admin-only match',async()=>{
 const original=pool.query,hash=await bcrypt.hash('Example-password',4);
 pool.query=async()=>({rows:[{id:'admin',role:'admin',password_hash:hash}]});
 try {let error;await login({body:{email:'admin',password:'Example-password',audience:'mobile'}},{},e=>error=e);assert.equal(error.statusCode,401);}
 finally{pool.query=original;}
});
test('new organization field values use upsert so an edit cannot silently disappear',async()=>{
 const originalQuery=pool.query,originalConnect=pool.connect,statements=[];
 pool.query=async sql=>({rows:sql.includes('SELECT form_id')?[{form_id:'form'}]:sql.includes('organization_form_fields')?[{id:'new-field',field_name:'Name',field_type:'text',required:true,enabled:true}]:[{field_visibility:{}}]});
 pool.connect=async()=>({query:async(sql,values)=>{statements.push({sql,values});return {rows:[]}},release(){}});
 try {let error,payload;await updateOrganizationAppSubmission({user:{organizationId:'org'},params:{submissionId:'person'},body:{values:{'new-field':'Asha'}}},{json(v){payload=v}},e=>error=e);assert.equal(error,undefined);assert.equal(payload.status,'ok');assert.ok(statements.some(s=>s.sql.includes('ON CONFLICT')&&s.values[0]==='Asha'));}
 finally{pool.query=originalQuery;pool.connect=originalConnect;}
});
test('crop replacement requires explicit Save before storing or marking a photo',async()=>{
 const originalQuery=pool.query,originalConnect=pool.connect;
 pool.query=async sql=>({rows:sql.includes('FROM users')?[{is_super_admin:true}]:[]});
 pool.connect=async()=>({query:async()=>({rows:[]}),release(){}});
 try {let error;await replaceOrganizationSubmissionPhoto({user:{role:'admin',userId:'admin'},params:{id:'org',submissionId:'person',fieldId:'photo'},body:{},file:{buffer:Buffer.from('photo')}},{},e=>error=e);assert.equal(error.statusCode,400);assert.match(error.message,/Save/);}
 finally{pool.query=originalQuery;pool.connect=originalConnect;}
});

test('Excel round-trip updates the existing photo number without overwriting images', async () => {
 const XLSX = require('xlsx');
 const {uploadOrganizationExcel} = require('../dist/controllers/organizationPortalController');
 const originalQuery=pool.query, originalConnect=pool.connect, statements=[];
 const fields=[{id:'name',field_name:'Person Name',field_type:'text',enabled:true},{id:'photo',field_name:'Photo',field_type:'photo',enabled:true}];
 pool.query=async sql=>({rows:sql.includes('FROM users')?[{is_super_admin:true}]:sql.includes('FROM organization_forms')?[{id:'form'}]:sql.includes('FROM organization_form_fields')?fields:[{id:'org'}]});
 pool.connect=async()=>({query:async(sql,values)=>{statements.push({sql,values});return {rows:sql.includes('SELECT id FROM organization_submissions')?[{id:'existing'}]:[]}},release(){}});
 const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,XLSX.utils.json_to_sheet([{'Photo Number':'ADD_001',' Person Name ':'Asha Updated',Photo:'Photo'}]),'Data');
 try {
  let error,payload;await uploadOrganizationExcel({user:{role:'admin',userId:'admin'},params:{id:'org'},file:{buffer:XLSX.write(workbook,{type:'buffer',bookType:'xlsx'})}},{status(){return this},json(v){payload=v}},e=>error=e);
  assert.equal(error,undefined);assert.deepEqual(payload,{status:'ok',inserted:0,updated:1});
  assert.ok(!statements.some(s=>s.sql.includes('INSERT INTO organization_submissions')));
  const edits=statements.filter(s=>s.sql.includes('INSERT INTO organization_submission_values'));
  assert.equal(edits.length,1);assert.deepEqual(edits[0].values,['existing','name','Asha Updated']);
  assert.match(edits[0].sql,/DO UPDATE SET text_value = EXCLUDED.text_value$/);
 } finally {pool.query=originalQuery;pool.connect=originalConnect;}
});

test('failed crop commit rolls back and removes the newly uploaded image without reporting success', async () => {
 const storage=require('../dist/config/storage');
 const originalQuery=pool.query,originalConnect=pool.connect,originalUpload=storage.uploadBufferToBucket,originalDelete=storage.deleteFromBucket;
 const statements=[], uploaded=[], deleted=[];
 pool.query=async sql=>({rows:sql.includes('FROM users')?[{is_super_admin:true}]:[{id:'org'}]});
 pool.connect=async()=>({query:async sql=>{statements.push(sql);if(sql==='COMMIT')throw new Error('simulated database failure');return {rows:[]}},release(){}});
 storage.uploadBufferToBucket=async(bucket,path)=>{uploaded.push(path);return path};
 storage.deleteFromBucket=async(bucket,path)=>{deleted.push(path)};
 try {
  let error,responded=false;await replaceOrganizationSubmissionPhoto({user:{role:'admin',userId:'admin'},params:{id:'org',submissionId:'person',fieldId:'photo'},body:{markCropped:'1'},file:{buffer:Buffer.from('image'),mimetype:'image/jpeg'}},{json(){responded=true}},e=>error=e);
  assert.match(error.message,/simulated database failure/);assert.equal(responded,false);assert.ok(statements.includes('ROLLBACK'));
  assert.equal(uploaded.length,1);assert.deepEqual(deleted,uploaded);
 } finally {pool.query=originalQuery;pool.connect=originalConnect;storage.uploadBufferToBucket=originalUpload;storage.deleteFromBucket=originalDelete;}
});

test('organization required-details reads its own profile and owner-scoped templates', async () => {
 const {getTeacherOrganization}=require('../dist/controllers/organizationController');
 const original=pool.query,statements=[];
 pool.query=async(sql,values)=>{statements.push({sql,values});return {rows:sql.includes('SELECT owner_admin_id')?[{owner_admin_id:'owner'}]:sql.includes('FROM templates')?[]:[{id:'org',name:'Organization',school_code:'ORG',field_visibility:{detail_logo:false}}]}};
 try {
  let error,payload;await getTeacherOrganization({user:{role:'organization_staff',organizationId:'org'}},{status(){return this},json(v){payload=v}},e=>error=e);
  assert.equal(error,undefined);assert.equal(payload.school.school_code,'ORG');
  assert.ok(statements.some(s=>s.sql.includes('FROM organizations')&&s.values[0]==='org'));
  assert.ok(!statements.some(s=>s.sql.includes('FROM schools')));
  assert.deepEqual(statements.find(s=>s.sql.includes('FROM templates')).values,['owner']);
 }finally{pool.query=original;}
});

test('organization required-details saves only the authenticated organization profile', async () => {
 const {updateTeacherOrganization}=require('../dist/controllers/organizationController');
 const original=pool.query,statements=[];
 pool.query=async(sql,values)=>{statements.push({sql,values});return {rows:[{id:'org',name:'Org',phone:'old',template_id:null}]}};
 try{
  let error,payload;await updateTeacherOrganization({user:{role:'organization_staff',organizationId:'org'},body:{phone:'123',school_code:'ORG-1',year:'2026',address:'Vizag'}},{status(){return this},json(v){payload=v}},e=>error=e);
  assert.equal(error,undefined);assert.equal(payload.status,'ok');
  const write=statements.find(s=>s.sql.includes('UPDATE organizations'));assert.ok(write);assert.equal(write.values.at(-1),'org');assert.equal(write.values[0],'123');assert.equal(write.values[2],'ORG-1');
  assert.ok(!statements.some(s=>s.sql.includes('UPDATE schools')));
 }finally{pool.query=original;}
});

test('disabled organizations cannot access shared profile routes', async()=>{
 const {requireActiveTeacherOrg}=require('../dist/middleware/orgAccess');const original=pool.query;
 pool.query=async()=>({rows:[{is_active:false}]});
 try {let error;await requireActiveTeacherOrg({user:{role:'organization_staff',organizationId:'org'}},{},e=>error=e);assert.equal(error.statusCode,403);}
 finally{pool.query=original;}
});

test('organization cannot select a template belonging to another admin', async()=>{
 const {updateTeacherOrganization}=require('../dist/controllers/organizationController');const original=pool.query;let wrote=false;
 pool.query=async sql=>{if(sql.includes('UPDATE'))wrote=true;return {rows:sql.includes('FROM templates')?[]:sql.includes('SELECT owner_admin_id')?[{owner_admin_id:'owner'}]:[{id:'org',template_id:null}]}};
 try{let error;await updateTeacherOrganization({user:{role:'organization_staff',organizationId:'org'},body:{template_id:'foreign-template'}},{},e=>error=e);assert.equal(error.statusCode,400);assert.equal(wrote,false);}
 finally{pool.query=original;}
});

test('raw organization photo replacement clears cropped status and resets capture timestamp',async()=>{
 const storage=require('../dist/config/storage');
 const originalQuery=pool.query,originalConnect=pool.connect,originalUpload=storage.uploadBufferToBucket;
 const statements=[];
 pool.query=async sql=>({rows:sql.includes('FROM users')?[{is_super_admin:true}]:[{id:'org'}]});
 pool.connect=async()=>({query:async(sql,values)=>{statements.push({sql,values});return {rows:[]}},release(){}});
 storage.uploadBufferToBucket=async()=>{};
 try{
  let error,payload;await replaceOrganizationSubmissionPhoto({user:{role:'admin',userId:'admin'},params:{id:'org',submissionId:'person',fieldId:'photo'},body:{replacePhoto:'1'},file:{buffer:Buffer.from('image'),mimetype:'image/jpeg'}},{json(v){payload=v}},e=>error=e);
  assert.equal(error,undefined);assert.equal(payload.student.photo_cropped,false);
  const imageWrite=statements.find(s=>s.sql.includes('INSERT INTO organization_submission_values'));
  assert.equal(imageWrite.values[3],false);assert.match(imageWrite.sql,/ELSE NOW\(\) END/);
 }finally{pool.query=originalQuery;pool.connect=originalConnect;storage.uploadBufferToBucket=originalUpload;}
});

test('duplicate database violation is a readable 409 response',()=>{
 const {errorHandler}=require('../dist/middleware/errorHandler');let code,body;
 const error=Object.assign(new Error('duplicate'),{code:'23505',constraint:'duplicate_record_details'});
 errorHandler(error,{}, {status(v){code=v;return this},json(v){body=v}},()=>{});
 assert.equal(code,409);assert.equal(body.message,'Data already exists. Please contact admin.');
});

test('organization photo number collision rolls back the entire edit',async()=>{
 const {updateOrganizationSubmissionAdmin}=require('../dist/controllers/organizationPortalController');
 const q=pool.query,c=pool.connect,statements=[];
 pool.query=async sql=>({rows:sql.includes('FROM users')?[{is_super_admin:true}]:sql.includes('SELECT form_id')?[{form_id:'form'}]:sql.includes('organization_form_fields')?[]:[{id:'org'}]});
 pool.connect=async()=>({query:async(sql,values)=>{statements.push(sql);return {rows:sql.includes('lower(photo_number)')?[{id:'existing'}]:[]}},release(){}});
 try{let error;await updateOrganizationSubmissionAdmin({user:{role:'admin',userId:'admin'},params:{id:'org',submissionId:'person'},body:{photoNumber:'ADD_001',values:{}}},{json(){throw Error('must not report success')}},e=>error=e);
 assert.equal(error.statusCode,409);assert.ok(statements.includes('ROLLBACK'));assert.ok(!statements.some(s=>s.startsWith('UPDATE')));
 }finally{pool.query=q;pool.connect=c;}
});

test('admin can edit the photo number and clear optional data without app edit permission',async()=>{
 const {updateStudentAdmin}=require('../dist/controllers/studentController');const original=pool.query;let update;
 const row={id:'person',school_id:'school',institute_id:null,student_name:'Asha',class_section:'6',photo_id:'ADD_001',parent_phone:'123',extra_fields:{photo_id:'ADD_001'},field_labels:{photo_id:'Photo Number'}};
 pool.query=async(sql,values)=>{
  if(sql.includes('FROM users'))return {rows:[{is_super_admin:true}]};
  if(sql.startsWith('UPDATE students')){update={sql,values};return {rows:[row]};}
  if(sql.includes('FROM students'))return {rows:[row]};
  return {rows:[]};
 };
 try{let error;await updateStudentAdmin({user:{role:'admin',userId:'admin'},params:{id:'person'},body:{photo_id:'CUSTOM_001',parent_phone:null}},{status(){return this},json(){}},e=>error=e);
 assert.equal(error,undefined);assert.equal(update.values[4],null);assert.equal(update.values[14],'CUSTOM_001');assert.equal(JSON.parse(update.values[12]).photo_id,'CUSTOM_001');assert.doesNotMatch(update.sql,/parent_phone = COALESCE/);
 }finally{pool.query=original;}
});
