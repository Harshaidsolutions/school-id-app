const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),path=require('path'),ts=require('typescript');
const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/api/client.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
function origin(env,extra){
 const context={exports:{},process:{env:{EXPO_PUBLIC_API_URL:env}},require(name){
  if(name==='axios')return {create:()=>({interceptors:{request:{use(){}},response:{use(){}}}})};
  if(name==='expo-constants')return {expoConfig:{extra:{apiUrl:extra}}};
  if(name.includes('tokenStorage'))return {getToken:async()=>null};
  throw Error(name);
 }};vm.runInNewContext(code,context);return context.exports.API_BASE_URL;
}
test('retired production IP and HTTP origin use HTTPS API without a duplicated prefix',()=>{
 for(const old of ['http://13.203.129.105','http://13.203.129.105/api/','http://myschoolidcard.in/api'])assert.equal(origin(old), 'https://myschoolidcard.in/api');
});
test('release fallback is production and explicit local servers are preserved',()=>{
 assert.equal(origin(undefined,undefined),'https://myschoolidcard.in/api');
 assert.equal(origin('http://192.168.1.10:5000/api'),'http://192.168.1.10:5000/api');
});
