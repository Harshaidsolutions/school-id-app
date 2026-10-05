const { test } = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../dist/config/database');
const { hasAllRequiredFieldData, matchesExportScope } = require('../dist/utils/recordStatus');
const { resolveIsSuperAdmin } = require('../dist/utils/adminScope');
const { authMiddleware, signAuthToken, credentialVersion } = require('../dist/middleware/auth');
const { consumeAttempt } = require('../dist/middleware/attemptLimit');
const { deleteSchoolPhotosData, bulkUploadStudents } = require('../dist/controllers/studentController');
const { runPhotoCleanup } = require('../dist/jobs/photoCleanup');

const fields = [
  {key:'student_name', label:'Name', enabled:true},
  {key:'parent_phone', label:'Phone', enabled:true},
  {key:'signature_upload', label:'Signature', enabled:true},
];
test('hidden and signature fields do not keep a populated record pending', () => {
  assert.equal(hasAllRequiredFieldData({student_name:'Asha'}, fields, {parent_phone:false}, true), true);
  assert.equal(hasAllRequiredFieldData({student_name:'Asha'}, fields, {}, true), false);
  assert.equal(hasAllRequiredFieldData({}, fields, {student_name:false,parent_phone:false}, true), true);
});
test('photo and pending-data export filters have separate meanings', () => {
  const ctx = {fields, visibility:{parent_phone:false}, institute:true};
  const row = {student_name:'Asha', photo_url:'photo.jpg'};
  assert.equal(matchesExportScope(row,'captured',ctx),true);
  assert.equal(matchesExportScope(row,'pending',ctx),false);
  assert.equal(matchesExportScope(row,'pending-data',ctx),false);
  assert.equal(matchesExportScope({...row,student_name:''},'captured-pending-data',ctx),true);
});
test('similar names never grant super-admin privileges', () => {
  for (const email of ['harshaidsolutions-attacker@example.com', 'harshaidsolutions@gmail.com']) {
    assert.equal(resolveIsSuperAdmin({role:'admin', email, username:'harshaid',is_super_admin:false}),false);
  }
  assert.equal(resolveIsSuperAdmin({role:'admin',is_super_admin:true}),true);
  assert.equal(resolveIsSuperAdmin({role:'teacher',is_super_admin:true}),false);
});
test('attempt limits reject excess attempts independently for each identity', () => {
  consumeAttempt('regression-one', 2);
  consumeAttempt('regression-one', 2);
  assert.throws(() => consumeAttempt('regression-one',2), (e) => e.statusCode === 429);
  assert.doesNotThrow(() => consumeAttempt('regression-two',2));
});
test('disabled accounts and changed passwords invalidate signed tokens', async () => {
  process.env.JWT_SECRET = 'regression-test-secret-only';
  const original = pool.query;
  const current = {role:'admin',password_hash:'hash-before',is_active:true,is_super_admin:false};
  pool.query = async () => ({rows:[current]});
  try {
    const token = signAuthToken({userId:'11111111-1111-4111-8111-111111111111',role:'admin',schoolId:null,assignedClass:null,assignedSection:null,credentialVersion:credentialVersion('hash-before'),isSuperAdmin:true});
    async function authenticate() {
      const req = {headers:{authorization:`Bearer ${token}`}};
      let error;
      await authMiddleware(req,{},(err)=>{error=err;});
      return {req,error};
    }
    let outcome = await authenticate();
    assert.equal(outcome.error,undefined);
    assert.equal(outcome.req.user.isSuperAdmin,false);
    current.is_active=false;
    assert.equal((await authenticate()).error.statusCode,401);
    current.is_active=true;
    current.password_hash='hash-after';
    assert.equal((await authenticate()).error.statusCode,401);
  } finally {pool.query=original;}
});
test('cross-owner photo deletion is denied before any mutation', async () => {
  const originalQuery=pool.query, originalConnect=pool.connect;
  const statements=[];
  pool.query=async (sql)=>({rows:sql.includes('FROM users')?[{is_super_admin:false}]:[]});
  pool.connect=async()=>({query:async(sql)=>{statements.push(sql);return {rows:[]};},release(){}});
  try {
    let error;
    await deleteSchoolPhotosData({user:{userId:'admin',role:'admin'},params:{schoolId:'other-school'},body:{otp:'123456'}},{},e=>{error=e;});
    assert.equal(error.statusCode,404);
    assert.equal(statements.some(sql=>/DELETE|UPDATE/.test(sql)),false);
  } finally {pool.query=originalQuery;pool.connect=originalConnect;}
});
test('cross-owner import is denied before parsing a workbook', async () => {
  const originalQuery=pool.query, originalConnect=pool.connect;
  pool.query=async (sql)=>({rows:sql.includes('FROM users')?[{is_super_admin:false}]:[]});
  pool.connect=async()=>({query:async()=>({rows:[]}),release(){}});
  try {
    let error;
    await bulkUploadStudents({user:{userId:'admin',role:'admin'},body:{schoolId:'other-school'},file:{buffer:Buffer.from('not a workbook')}},{},e=>{error=e;});
    assert.equal(error.statusCode,404);
  } finally {pool.query=originalQuery;pool.connect=originalConnect;}
});
test('photo cleanup is disabled unless explicitly enabled', async () => {
  const original=pool.query, flag=process.env.PHOTO_CLEANUP_ENABLED;
  delete process.env.PHOTO_CLEANUP_ENABLED;
  pool.query=async()=>{throw new Error('must not query or delete photos');};
  try {assert.equal((await runPhotoCleanup()).deleted,0);}
  finally {pool.query=original;if(flag===undefined) delete process.env.PHOTO_CLEANUP_ENABLED;else process.env.PHOTO_CLEANUP_ENABLED=flag;}
});
test('replacement of captured records rolls back before deleting rows', async () => {
  const XLSX=require('xlsx');
  const workbook=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([['PHOTO','CLASS','NAME'],['1','1-A','Asha']]),'Students');
  const originalQuery=pool.query,originalConnect=pool.connect;
  const statements=[];
  pool.query=async()=>({rows:[{is_super_admin:true}]});
  pool.connect=async()=>({
    query:async(sql)=>{statements.push(sql);return sql.includes('NULLIF(btrim(photo_url)')?{rows:[{id:'captured'}],rowCount:1}:{rows:[],rowCount:0};},
    release(){},
  });
  try {
    let error;
    await bulkUploadStudents({user:{userId:'admin',role:'admin'},body:{schoolId:'school',replaceExisting:true},file:{buffer:XLSX.write(workbook,{type:'buffer',bookType:'xlsx'}),originalname:'students.xlsx'}},{},e=>{error=e;});
    assert.equal(error.statusCode,409);
    assert.equal(statements.includes('ROLLBACK'),true);
    assert.equal(statements.some(sql=>sql.startsWith('DELETE')),false);
  } finally {pool.query=originalQuery;pool.connect=originalConnect;}
});
test('schema update failure rolls the student import back instead of reporting a partial save', async () => {
  const XLSX=require('xlsx');
  const workbook=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([['PHOTO','CLASS','NAME'],['1','1-A','Asha']]),'Students');
  const originalQuery=pool.query,originalConnect=pool.connect;
  const statements=[];
  pool.query=async()=>({rows:[{is_super_admin:true}]});
  pool.connect=async()=>({query:async(sql)=>{
    statements.push(sql);
    if(sql.includes('INSERT INTO import_batches'))return {rows:[{id:'batch'}],rowCount:1};
    if(sql.includes('UPDATE form_configs'))throw new Error('simulated schema write failure');
    return {rows:[],rowCount:0};
  },release(){}});
  try {
    let error;
    await bulkUploadStudents({user:{userId:'admin',role:'admin'},body:{schoolId:'school'},file:{buffer:XLSX.write(workbook,{type:'buffer',bookType:'xlsx'}),originalname:'students.xlsx'}},{},e=>{error=e;});
    assert.match(error.message,/simulated schema/);
    assert.equal(statements.some(sql=>sql.includes('INSERT INTO students')),true);
    assert.equal(statements.includes('ROLLBACK'),true);
    assert.equal(statements.includes('COMMIT'),false);
  } finally {pool.query=originalQuery;pool.connect=originalConnect;}
});
