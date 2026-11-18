const typingIndicator = (() => {
  let users = new Map();
  function paint() {
    const element=$('#typing-indicator');if(!element)return;
    const now=Date.now();for(const [key,item] of users)if(item.until<now)users.delete(key);
    const active=[...users.values()].filter(item=>item.channel===state.selected&&item.user!==state.me?.id);
    element.hidden=!active.length||state.demo;
    element.textContent=active.length?`${active.slice(0,3).map(item=>displayName(state.users[item.user])).join(', ')}${active.length>3?' 외 '+(active.length-3)+'명':''} 입력 중…`:'';
  }
  api?.onTyping(async data=>{if(!state.me||state.demo||!state.channels.some(channel=>channel.id===data.channel_id))return;const epoch=state.generation;users.set(data.channel_id+':'+data.user_id,{channel:data.channel_id,user:data.user_id,until:Date.now()+6000});await hydrateUsers([data.user_id]).catch(()=>{});if(epoch===state.generation)paint();});
  document.addEventListener('input',event=>{if(event.target.id==='message-input'&&event.target.value.trim()&&state.me&&!state.demo)api.sendTyping(state.selected,messageActions.replyRoot(state.selected)).catch(()=>{});});
  setInterval(paint,1000);
  return { paint, reset:()=>{users=new Map();paint();} };
})();
