const {test}=require('node:test'),assert=require('node:assert/strict');const {pool}=require('../dist/config/database');const {unregisterTeacherPushToken}=require('../dist/controllers/pushTokenController');const sns=require('../dist/utils/snsPush');
test('notification switch can unregister only the authenticated user token',async()=>{
 const q=pool.query,d=sns.deactivateSnsEndpoint;const queries=[],disabled=[];
 pool.query=async(sql,values)=>{queries.push({sql,values});return {rows:[]}};sns.deactivateSnsEndpoint=async arn=>disabled.push(arn);
 try{let error;await unregisterTeacherPushToken({user:{userId:'owner'},body:{pushToken:'foreign-token'}},{status(){return this},json(){}},e=>error=e);assert.equal(error,undefined);assert.equal(queries.length,2);for(const query of queries){assert.match(query.sql,/user_id = \$2/);assert.deepEqual(query.values,['foreign-token','owner']);}assert.equal(disabled.length,0);}finally{pool.query=q;sns.deactivateSnsEndpoint=d;}
});
