const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),path=require('path'),ts=require('typescript');
const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/utils/notificationPreference.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
function fixture(initial={}) {
 const values=new Map(Object.entries(initial)),calls=[];let failDelete=false,permission=true,delay;
 const context={exports:{},console,require(name){
 if(name.includes('async-storage'))return{getItem:async k=>values.get(k)??null,setItem:async(k,v)=>values.set(k,v)};
 if(name.includes('constants/pushNotifications'))return{ANDROID_NOTIFICATION_CHANNEL_ID:'school'};
 if(name==='expo-notifications')return{setNotificationChannelAsync:async()=>{},AndroidImportance:{MAX:5},requestPermissionsAsync:async()=>({granted:permission}),getDevicePushTokenAsync:async()=>({data:'device-token'}),cancelAllScheduledNotificationsAsync:async()=>calls.push('cancel'),dismissAllNotificationsAsync:async()=>calls.push('dismiss'),setBadgeCountAsync:async()=>{}};
 if(name==='expo-device')return{modelName:'Phone'};
 if(name==='react-native')return{Platform:{OS:'android'}};
 if(name==='react')return{};
 if(name.includes('api/client'))return{post:async()=>{calls.push('register');if(delay)await delay;},delete:async()=>{calls.push('unregister');if(failDelete)throw Error('offline');}};
 throw Error(name);
 }};vm.runInNewContext(code,context);return {api:context.exports,values,calls,setFail:v=>failDelete=v,setPermission:v=>permission=v,setDelay:v=>delay=v};
}
test('Off unregisters before confirmation, clears tray, persists and blocks subsequent registration',async()=>{
 const f=fixture({'teacher_fcm_push_token':'device-token'});await f.api.setNotificationPreference(false);assert.equal(await f.api.notificationAlertsEnabled(),false);assert.equal(f.values.get('notification_alerts_enabled'),'off');assert.deepEqual(f.calls,['unregister','cancel','dismiss']);assert.equal(await f.api.registerNotificationToken('rotated',null,null),false);assert.equal(f.calls.length,3);
 const restarted=fixture(Object.fromEntries(f.values));assert.equal(await restarted.api.notificationAlertsEnabled(),false);
});
test('Failed unregister does not falsely show Off; denied permission does not enable alerts',async()=>{
 const f=fixture();f.setFail(true);await assert.rejects(f.api.setNotificationPreference(false),/offline/);assert.equal(await f.api.notificationAlertsEnabled(),true);
 const off=fixture({'notification_alerts_enabled':'off'});off.setPermission(false);await assert.rejects(off.api.setNotificationPreference(true),/Allow notifications/);assert.equal(await off.api.notificationAlertsEnabled(),false);assert.equal(off.calls.length,0);
});
test('In-flight registration finishes before Off, so it cannot reactivate the token afterwards',async()=>{
 const f=fixture();let release;f.setDelay(new Promise(r=>release=r));const first=f.api.registerNotificationToken('token',null,null);const off=f.api.setNotificationPreference(false);release();await first;await off;assert.deepEqual(f.calls.slice(0,2),['register','unregister']);assert.equal(await f.api.notificationAlertsEnabled(),false);
});
test('On registers the phone again and persists the preference',async()=>{
 const f=fixture({'notification_alerts_enabled':'off'});await f.api.setNotificationPreference(true);assert.equal(await f.api.notificationAlertsEnabled(),true);assert.equal(f.values.get('teacher_fcm_push_token'),'device-token');assert.deepEqual(f.calls,['register']);
});
