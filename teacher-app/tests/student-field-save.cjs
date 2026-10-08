const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm'),ts=require('typescript');
const cache={};function load(file){file=path.resolve(file);if(cache[file])return cache[file];const out={};cache[file]=out;const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;vm.runInNewContext(code,{exports:out,require:n=>n.startsWith('.')?load(path.resolve(path.dirname(file),n)+'.ts'):require(n)});return out;}
const {buildTeacherStudentPayload}=load(path.join(__dirname,'../src/utils/studentFieldForm.ts'));
test('edited Excel aliases replace stale values, including cleared fields and separate parent names',()=>{
const fields=['Student Name','Class','Parent Name','Mother Name','Parent Phone','Address'].map((label,i)=>({key:'fld_'+i,label,enabled:true,order:i}));
const state={firstName:'New',lastName:'Name',classSection:'6 A',rollNo:'',dob:'',gender:'',bloodGroup:'',parentName:'Father Updated',parentPhone:'9999999999',address:'',custom1:'',custom2:'',custom3:'',extraValues:{fld_0:'Old Name',fld_1:'5 A',fld_2:'Old Father',fld_3:'Mother Updated',fld_4:'1111111111',fld_5:'Old address'}};
const payload=buildTeacherStudentPayload(fields,state);
assert.equal(payload.extra_fields.fld_0,'New Name');assert.equal(payload.extra_fields.fld_1,'6 A');assert.equal(payload.extra_fields.fld_2,'Father Updated');assert.equal(payload.extra_fields.fld_3,'Mother Updated');assert.equal(payload.extra_fields.fld_4,'9999999999');assert.equal(payload.extra_fields.fld_5,null);
});
