const {test}=require('node:test'),assert=require('node:assert/strict'),{read}=require('../src/user-status.js');
test('custom status reads server props, defaults its emoji and hides expired/invalid values',()=>{
 const user=value=>({props:{customStatus:typeof value==='string'?value:JSON.stringify(value)}});
 assert.equal(read(user('invalid')),null);assert.equal(read(user({})),null);assert.equal(read(user({emoji:'coffee',text:'회의',expires_at:'2020-01-01T00:00:00Z'})),null);
 const value=read(user({text:'원격 근무',expires_at:'0001-01-01T00:00:00Z'}));assert.equal(value.emoji,'speech_balloon');assert.equal(value.text,'원격 근무');
 const timed=read(user({emoji:':coffee:',text:'회의',duration:'one_hour',expires_at:'2030-01-01T00:00:00Z'}),Date.UTC(2029,0,1));assert.equal(timed.emoji,'coffee');assert.equal(timed.duration,'one_hour');
});

test('status duration choices produce future local deadlines including next Monday',()=>{
 const {expiresAt}=require('../src/profile-controls.js'),now=Date.now();assert.equal(expiresAt('',''),'');assert.ok(Math.abs(Date.parse(expiresAt('one_hour',''))-now-3600000)<1000);
 const today=new Date(expiresAt('today',''));assert.equal(today.getHours(),23);assert.equal(today.getMinutes(),59);
 const week=new Date(expiresAt('this_week',''));assert.equal(week.getDay(),1);assert.equal(week.getHours(),0);assert.ok(week.getTime()>now&&week.getTime()-now<=8*86400000);
});
