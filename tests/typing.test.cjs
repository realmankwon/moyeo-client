const {test}=require('node:test'),assert=require('node:assert/strict'),{WebSocketServer}=require('ws');const {TypingService}=require('../electron/typing.cjs');
const until=async fn=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,20));}throw Error('Timed out');};
test('typing authenticates through WebSocket, throttles outgoing state and ignores own events',async t=>{const server=new WebSocketServer({port:0,host:'127.0.0.1'});await new Promise(r=>server.on('listening',r));const me='a'.repeat(26),other='b'.repeat(26),channel='c'.repeat(26),messages=[],events=[];let peer;server.on('connection',socket=>{peer=socket;socket.on('message',bytes=>{messages.push(JSON.parse(bytes));});});const client={server:`http://127.0.0.1:${server.address().port}`,token:'secret',me:{id:me},mediaKey:'one'};const service=new TypingService(client,event=>events.push(event));t.after(()=>{service.stop();for(const socket of server.clients)socket.terminate();server.close();});service.start();await until(()=>messages.length);assert.equal(messages[0].action,'authentication_challenge');assert.equal(messages[0].data.token,'secret');service.send(channel);service.send(channel);await until(()=>messages.length===2);assert.deepEqual(messages[1].data,{channel_id:channel,parent_id:''});peer.send(JSON.stringify({event:'typing',data:{user_id:other},broadcast:{channel_id:channel}}));peer.send(JSON.stringify({event:'typing',data:{user_id:me},broadcast:{channel_id:channel}}));await until(()=>events.length===1);assert.deepEqual(events[0],{channel_id:channel,user_id:other,parent_id:''});service.stop();assert.equal(service.socket,null);});

test('read events accept current/legacy formats and reject another account or malformed times',async t=>{
 const server=new WebSocketServer({port:0,host:'127.0.0.1'});await new Promise(r=>server.on('listening',r));
 const me='a'.repeat(26),other='b'.repeat(26),channel='c'.repeat(26),second='d'.repeat(26),events=[];let peer;
 server.on('connection',socket=>{peer=socket;socket.on('message',()=>socket.send(JSON.stringify({event:'hello'})));});
 const service=new TypingService({server:`http://127.0.0.1:${server.address().port}`,token:'fixture',me:{id:me},mediaKey:'session'},()=>{},undefined,event=>events.push(event));
 t.after(()=>{service.stop();for(const socket of server.clients)socket.terminate();server.close();});service.start();await until(()=>service.connected);events.length=0;
 const send=(event,data,user=me)=>peer.send(JSON.stringify({event,data,broadcast:{user_id:user}}));
 send('multiple_channels_viewed',{channel_times:{[channel]:100,[second]:200,'invalid':300}});
 send('multiple_channels_viewed',{channel_times:JSON.stringify({[channel]:250})});
 send('channel_viewed',{channel_id:second});
 send('multiple_channels_viewed',{channel_times:{[channel]:999}},other);
 send('channel_viewed',{channel_id:second,user_id:other});
 send('multiple_channels_viewed',{channel_times:{[channel]:-1,[second]:'999'}});
 send('multiple_channels_viewed',{channel_times:'bad-json'});send('channel_viewed',{channel_id:'invalid'});
 await until(()=>events.length===3);await new Promise(r=>setTimeout(r,40));
 assert.deepEqual(events,[{type:'channels_viewed',times:{[channel]:100,[second]:200}},{type:'channels_viewed',times:{[channel]:250}},{type:'channel_viewed',channel:second}]);
});
