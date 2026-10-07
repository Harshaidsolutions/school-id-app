const {test}=require('node:test');const assert=require('node:assert/strict');
const {pool}=require('../dist/config/database');
const {buildGcmMessage}=require('../dist/utils/snsPush');
const notifications=require('../dist/controllers/notificationController');
const tokens=require('../dist/controllers/pushTokenController');
const storage=require('../dist/config/storage');

test('image push has one data-only display path, full text and a stable tray identifier',()=>{
 const msg=JSON.parse(buildGcmMessage({title:'Notice',body:'Full announcement',imageUrl:'https://example.test/image.jpg',data:{notificationId:'note-1'}}));
 assert.equal(msg.notification,undefined);assert.equal(msg.android,undefined);
 assert.equal(msg.data.message,'Full announcement');assert.equal(msg.data.imageUrl,'https://example.test/image.jpg');assert.equal(msg.data.tag,'admin-notification-note-1');
 const text=JSON.parse(buildGcmMessage({title:'Text',body:'Message',data:{notificationId:'note-2'}}));assert.equal(text.data.imageUrl,undefined);assert.equal(text.data.tag,'admin-notification-note-2');
});

test('retry of the same organization send returns the existing row without another image or push',async()=>{
 const q=pool.query,c=pool.connect,u=storage.uploadBufferToBucket,e=tokens.loadSnsEndpointsForOrg;let writes=0,uploads=0,pushes=0;
 const note={id:'note',organization_id:'org',school_id:null,institute_id:null,title:'Notice',message:'Text'};
 pool.query=async sql=>({rows:sql.includes('FROM users')?[{is_super_admin:true}]:[{id:'org'}]});
 pool.connect=async()=>({query:async sql=>{if(sql.startsWith('INSERT'))writes++;return{rows:sql.startsWith('SELECT * FROM notifications')?[note]:[]}},release(){}});
 storage.uploadBufferToBucket=async()=>{uploads++;return'image'};tokens.loadSnsEndpointsForOrg=async()=>{pushes++;return[]};
 try{let error,payload;await notifications.createNotification({user:{role:'admin',userId:'admin'},body:{organizationId:'org',title:'Notice',message:'Text',requestId:'retry-key'},file:{size:10,mimetype:'image/png',buffer:Buffer.from('image')}},{status(){return this},json(v){payload=v}},e=>error=e);
 assert.equal(error,undefined);assert.equal(payload.reused,true);assert.equal(writes,0);assert.equal(uploads,0);assert.equal(pushes,0);
 }finally{pool.query=q;pool.connect=c;storage.uploadBufferToBucket=u;tokens.loadSnsEndpointsForOrg=e;}
});

test('organization send rejects foreign-owner recipients before image upload',async()=>{
 const q=pool.query,c=pool.connect,u=storage.uploadBufferToBucket;let uploads=0;
 pool.query=async sql=>({rows:sql.includes('FROM users')?[{is_super_admin:false}]:[]});pool.connect=async()=>({query:async()=>({rows:[]}),release(){}});storage.uploadBufferToBucket=async()=>{uploads++;return'image'};
 try{let error;await notifications.createNotification({user:{role:'admin',userId:'admin'},body:{organizationId:'foreign',title:'Notice',message:'Text'},file:{size:10,mimetype:'image/png'}},{},e=>error=e);assert.equal(error.statusCode,404);assert.equal(uploads,0);
 }finally{pool.query=q;pool.connect=c;storage.uploadBufferToBucket=u;}
});

test('organization inbox/read/delete are restricted to the authenticated organization',async()=>{
 const q=pool.query;const statements=[];pool.query=async(sql,values)=>{statements.push({sql,values});return{rows:[]}};
 try{let error;const req={user:{role:'organization_staff',userId:'staff',organizationId:'org'},params:{id:'foreign-note'}};
 await notifications.listTeacherNotifications(req,{status(){return this},json(){}},e=>error=e);assert.equal(error,undefined);assert.match(statements[0].sql,/n.organization_id=\$1/);assert.deepEqual(statements[0].values,['org','staff']);
 await notifications.markTeacherNotificationRead(req,{status(){return this},json(){}},e=>error=e);assert.equal(error.statusCode,404);assert.ok(!statements.some(s=>s.sql.includes('INSERT')));
 await notifications.deleteAllTeacherNotifications(req,{status(){return this},json(){}},e=>error=e);assert.match(statements.at(-1).sql,/n.organization_id=\$1/);
 }finally{pool.query=q;}
});

test('organization endpoint lookup uses its own target column and distinct active endpoints',async()=>{
 const q=pool.query;let seen;pool.query=async(sql,values)=>{seen={sql,values};return{rows:[{sns_endpoint_arn:'arn'}]}};
 try{assert.deepEqual(await tokens.loadSnsEndpointsForOrg({organizationId:'org'}),['arn']);assert.match(seen.sql,/DISTINCT/);assert.match(seen.sql,/organization_id=\$1/);assert.deepEqual(seen.values,['org']);}finally{pool.query=q;}
});

test('new organization image announcement stores and dispatches text and image together once',async()=>{
 const q=pool.query,c=pool.connect,u=storage.uploadBufferToBucket,e=tokens.loadSnsEndpointsForOrg;
 const sns=require('../dist/utils/snsPush'),send=sns.sendSnsPushNotifications,d=tokens.deactivatePushEndpoints;
 let insert,uploads=0,dispatches=[];
 pool.query=async sql=>({rows:sql.includes('FROM users')?[{is_super_admin:true}]:[{id:'org'}]});
 pool.connect=async()=>({query:async(sql,values)=>{if(sql.includes('INSERT INTO notifications')){insert=values;return{rows:[{id:'note-new'}]}}return{rows:[]}},release(){}});
 storage.uploadBufferToBucket=async()=>{uploads++;return'https://example.test/photo.jpg'};
 tokens.loadSnsEndpointsForOrg=async target=>{assert.equal(target.organizationId,'org');return['endpoint']};
 sns.sendSnsPushNotifications=async(endpoints,payload)=>{dispatches.push(payload);return{disabledEndpointArns:[]}};
 tokens.deactivatePushEndpoints=async()=>{};
 try{let error,status;await notifications.createNotification({user:{role:'admin',userId:'admin'},body:{organizationId:'org',title:'Notice',message:'Full text',requestId:'new-key'},file:{size:10*1024*1024,mimetype:'image/png',buffer:Buffer.from('image')}},{status(n){status=n;return this},json(){}},e=>error=e);
 await new Promise(resolve=>setImmediate(resolve));assert.equal(error,undefined);assert.equal(status,201);assert.equal(uploads,1);
 assert.deepEqual(insert,[null,null,'org','Notice','Full text','https://example.test/photo.jpg','admin','new-key']);assert.equal(dispatches.length,1);assert.equal(dispatches[0].body,'Full text');assert.equal(dispatches[0].imageUrl,'https://example.test/photo.jpg');
 }finally{pool.query=q;pool.connect=c;storage.uploadBufferToBucket=u;tokens.loadSnsEndpointsForOrg=e;sns.sendSnsPushNotifications=send;tokens.deactivatePushEndpoints=d;}
});


test('notification images above 10 MB are rejected before storage',async()=>{
 const c=pool.connect,u=storage.uploadBufferToBucket;let uploads=0;
 pool.connect=async()=>({query:async()=>({rows:[]}),release(){}});
 storage.uploadBufferToBucket=async()=>{uploads++;return'image'};
 try{let error;await notifications.createNotification({user:{role:'admin',userId:'admin'},body:{organizationId:'org',title:'Notice',message:'Text'},file:{size:10*1024*1024+1,mimetype:'image/png'}},{},e=>error=e);
 assert.equal(error.statusCode,400);assert.match(error.message,/10 MB/);assert.equal(uploads,0);
 }finally{pool.connect=c;storage.uploadBufferToBucket=u;}
});
