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
