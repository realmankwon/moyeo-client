const {validId}=require('./client.cjs');
class TypingService {
 constructor(client,notify,Socket=WebSocket,events=()=>{}){this.client=client;this.notify=notify;this.Socket=Socket;this.events=events;this.connected=false;this.serial=0;this.last=new Map();}
 stop(){const wasConnected=this.connected;this.connected=false;this.serial++;clearTimeout(this.retry);clearInterval(this.ping);this.last.clear();this.transmit=null;const socket=this.socket;this.socket=null;if(socket){socket.onclose=null;socket.onopen=null;socket.onmessage=null;socket.close();}if(wasConnected)this.events({type:'disconnected'});}
 start(){this.stop();const serial=this.serial,epoch=this.client.mediaKey;let failures=0,everConnected=false;
 const schedule=()=>{if(serial!==this.serial||epoch!==this.client.mediaKey)return;this.retry=setTimeout(connect,Math.min(30000,3000*2**Math.min(failures++,4)));this.retry.unref?.();};
 const connect=()=>{if(serial!==this.serial||epoch!==this.client.mediaKey||!this.client.me)return;const url=new URL(this.client.server+'/api/v4/websocket');url.protocol=url.protocol==='https:'?'wss:':'ws:';let socket;try{socket=new this.Socket(url.href);}catch{schedule();return;}this.socket=socket;let seq=1,awaiting=false,expected=null;
 const send=(action,data)=>{if(socket.readyState===1)socket.send(JSON.stringify({seq:seq++,action,data}));};
 this.transmit=send;
 socket.onopen=()=>{if(serial!==this.serial)return;failures=0;send('authentication_challenge',{token:this.client.token});clearInterval(this.ping);this.ping=setInterval(()=>{if(awaiting){socket.close();return;}awaiting=true;send('ping',{});},30000);this.ping.unref?.();};
 socket.onerror=()=>{};
 socket.onmessage=event=>{if(serial!==this.serial||epoch!==this.client.mediaKey)return;let message;try{message=JSON.parse(event.data);}catch{return;}if(message.seq_reply){awaiting=false;return;}
 if(Number.isInteger(message.seq)){if(expected!==null&&expected!==message.seq)this.events({type:'refresh',reason:'sequence_gap'});expected=message.seq+1;}
 if(message.event==='hello'){this.connected=true;this.events({type:'connected',reconnected:everConnected});everConnected=true;return;}
 const data=message.data||{};
 if(message.event==='typing'){try{validId(data.user_id);validId(message.broadcast?.channel_id||data.channel_id);}catch{return;}if(data.user_id!==this.client.me?.id)this.notify({user_id:data.user_id,channel_id:message.broadcast?.channel_id||data.channel_id,parent_id:data.parent_id||''});return;}
 if(['channel_viewed','multiple_channels_viewed'].includes(message.event)){
  if(message.broadcast?.user_id&&message.broadcast.user_id!==this.client.me?.id)return;
  if(data.user_id&&data.user_id!==this.client.me?.id)return;
  try{if(message.event==='channel_viewed'){validId(data.channel_id);this.events({type:'channel_viewed',channel:data.channel_id});}
  else{let values=data.channel_times;if(typeof values==='string'&&values.length<=1000000)values=JSON.parse(values);if(!values||typeof values!=='object'||Array.isArray(values))return;const times={};for(const [id,time]of Object.entries(values).slice(0,10000)){try{validId(id);}catch{continue;}if(Number.isSafeInteger(time)&&time>=0)times[id]=time;}if(Object.keys(times).length)this.events({type:'channels_viewed',times});}}catch{/* Ignore malformed read events. */}return;
 }
 try{if(message.event==='user_updated'){const raw=typeof data.user==='string'?JSON.parse(data.user):data.user;validId(raw.id);const user={};for(const key of ['id','username','nickname','first_name','last_name','position','email','locale','create_at','update_at','last_picture_update'])if(raw[key]!==undefined)user[key]=raw[key];if(raw.props&&typeof raw.props==='object')user.props={customStatus:raw.props.customStatus||''};if(user.id===this.client.me?.id)this.client.me={...this.client.me,...user};this.events({type:'user_updated',user:this.client.withAvatar(user)});}
 else if(['posted','post_edited','post_deleted'].includes(message.event)){const post=typeof data.post==='string'?JSON.parse(data.post):data.post;validId(post.id);validId(post.channel_id);let mentioned=false;if(message.event==='posted'){try{const ids=typeof data.mentions==='string'?JSON.parse(data.mentions):data.mentions;mentioned=Array.isArray(ids)&&ids.includes(this.client.me?.id);}catch{/* A malformed mention list only loses the mention highlight. */}}this.events({type:message.event,post,...(mentioned?{mentioned:true}:{})});}
 else if(message.event==='ephemeral_message'){const post=typeof data.post==='string'?JSON.parse(data.post):data.post;validId(post.id);validId(post.channel_id);this.events({type:'ephemeral',post:{...post,type:'system_ephemeral'}});}
 else if(message.event==='status_change'){if(data.user_id===this.client.me?.id&&typeof data.status==='string')this.events({type:'status',status:data.status});}
 else if(['reaction_added','reaction_removed'].includes(message.event)){const reaction=typeof data.reaction==='string'?JSON.parse(data.reaction):data.reaction;validId(reaction.post_id);validId(reaction.user_id);if(typeof reaction.emoji_name==='string')this.events({type:message.event,reaction});}
 else if(['channel_created','channel_updated','channel_deleted','user_added','user_removed','direct_added','group_added','channel_member_updated','channel_converted','added_to_team','leave_team','preferences_changed','config_changed'].includes(message.event))this.events({type:'refresh',reason:message.event});}catch{/* Ignore malformed events. */}
 };
 socket.onclose=()=>{clearInterval(this.ping);if(serial!==this.serial||epoch!==this.client.mediaKey)return;this.connected=false;this.events({type:'disconnected'});if(this.socket===socket)this.socket=null;schedule();};
 };connect();}
 send(channel,parent=''){validId(channel);if(parent)validId(parent);if(!this.client.me||this.socket?.readyState!==1)return;const key=channel+':'+parent,now=Date.now();if(now-(this.last.get(key)||0)<3000)return;this.last.set(key,now);this.transmit?.('user_typing',{channel_id:channel,parent_id:parent});}
}
module.exports={TypingService};
