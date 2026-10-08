const {test}=require('node:test'),assert=require('node:assert/strict');const {pool}=require('../dist/config/database');const {unregisterTeacherPushToken}=require('../dist/controllers/pushTokenController');const sns=require('../dist/utils/snsPush');
test('notification switch can unregister only the authenticated user token',async()=>{
 const q=pool.query,d=sns.deactivateSnsEndpoint;const queries=[],disabled=[];
 pool.query=async(sql,values)=>{queries.push({sql,values});return {rows:[]}};sns.deactivateSnsEndpoint=async arn=>disabled.push(arn);
 try{let error;await unregisterTeacherPushToken({user:{userId:'owner'},body:{pushToken:'foreign-token'}},{status(){return this},json(){}},e=>error=e);assert.equal(error,undefined);assert.equal(queries.length,1);for(const query of queries){assert.match(query.sql,/user_id = \$2/);assert.deepEqual(query.values,['foreign-token','owner']);}assert.equal(disabled.length,0);}finally{pool.query=q;sns.deactivateSnsEndpoint=d;}
});
test('notification Off removes delivery token without calling SNS',async()=>{
 const q=pool.query,d=sns.deactivateSnsEndpoint;let removed=false,error;pool.query=async(sql)=>{if(sql.startsWith('DELETE'))removed=true;return {rows:[{sns_endpoint_arn:'endpoint'}]}};
 sns.deactivateSnsEndpoint=async()=>{assert.equal(removed,true);throw Error('SNS unavailable')};
 try{await unregisterTeacherPushToken({user:{userId:'owner'},body:{pushToken:'token'}},{status(){return this},json(){}},e=>error=e);assert.equal(removed,true);assert.equal(error,undefined);}finally{pool.query=q;sns.deactivateSnsEndpoint=d;}
});
