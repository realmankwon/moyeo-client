const messageNavigation = (() => {
  let ticket = 0, history = [], cancelRestore = () => {};
  function snapshot() {
    const area=$('#messages'), top=area?.getBoundingClientRect().top || 0;
    const anchor=area && [...area.querySelectorAll('[data-message-id]')].find(element=>element.getBoundingClientRect().bottom>top);
    return { channel:state.selected,posts:structuredClone(state.posts),hasMore:state.hasMore,historyCursor:state.historyCursor,postFocus:state.postFocus,search:state.search,filter:state.filter,top:area?.scrollTop||0,anchor:anchor?.dataset.messageId,offset:anchor?anchor.getBoundingClientRect().top-top:0 };
  }
  function restorePosition(saved) {
    cancelRestore();const area=$('#messages');if(!area)return;
    followMessageScroll(area,false);
    const position=()=>{if(!area.isConnected||state.selected!==saved.channel)return;const anchor=saved.anchor&&area.querySelector(`[data-message-id="${CSS.escape(saved.anchor)}"]`);area.scrollTop=anchor?area.scrollTop+anchor.getBoundingClientRect().top-area.getBoundingClientRect().top-saved.offset:saved.top;};
    position();const observer=new ResizeObserver(position);observer.observe(area);for(const child of area.children)observer.observe(child);
    const stop=()=>{observer.disconnect();clearTimeout(timer);area.removeEventListener('wheel',stop);area.removeEventListener('pointerdown',stop);area.removeEventListener('touchstart',stop);area.removeEventListener('keydown',stop);};
    const timer=setTimeout(stop,10000);area.addEventListener('wheel',stop,{passive:true});area.addEventListener('pointerdown',stop,{passive:true});area.addEventListener('touchstart',stop,{passive:true});area.addEventListener('keydown',stop);
    cancelRestore=stop;
  }
  async function open(address, postId = '') {
    const current=++ticket,epoch=state.generation,sourceChannel=state.selected;
    let context = null;
    if (state.me && state.demo && postId) {
      const channel = state.channels.find(item => state.demoPosts[item.id]?.some(post => post.id === postId && !post.delete_at));
      const posts = channel && state.demoPosts[channel.id];
      if (posts) context = { channel, posts: [...posts], post: posts.find(post => post.id === postId) };
    } else if (state.me && !state.demo) {
      context = await api.resolvePostLink(postId ? await api.postLink(postId) : address);
    }
    if(current!==ticket||epoch!==state.generation||sourceChannel!==state.selected)return;
    if (!context) { if (postId) throw new Error('원본 메시지가 삭제되었거나 접근할 수 없습니다.'); return api.openLink(address); }
    await hydrateUsers(context.posts.map(post=>post.user_id));
    if(current!==ticket||epoch!==state.generation||sourceChannel!==state.selected)return;
    cancelRestore();if(state.selected&&$('#messages')){history.push(snapshot());if(history.length>20)history.shift();}
    document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());
    if(!state.channels.some(channel=>channel.id===context.channel.id))state.channels.push(context.channel);
    state.search='';state.filter='all';renderShell();await selectChannel(context.channel.id);
    if(current!==ticket||epoch!==state.generation||state.selected!==context.channel.id)return;
    state.posts=context.posts.sort((a,b)=>a.create_at-b.create_at);state.hasMore=context.posts.filter(post=>post.create_at<context.post.create_at).length>=30;
    state.postFocus=context.post.id;paint();renderMessages();followMessageScroll($('#messages'),false);
    const target=document.querySelector(`[data-message-id="${context.post.id}"]`);target?.classList.add('message-target');target?.scrollIntoView({block:'center'});target?.focus({preventScroll:true});
  }
  function back() {
    const saved=history.at(-1);if(!saved||!state.me)return;
    if(!state.channels.some(channel=>channel.id===saved.channel)){toast('이전 채팅방에 더 이상 접근할 수 없습니다.');return;}
    ticket++;cancelRestore();history.pop();state.loadingTicket=(state.loadingTicket||0)+1;state.channelLoading=false;state.selected=saved.channel;state.posts=structuredClone(saved.posts);state.hasMore=saved.hasMore;state.historyCursor=saved.historyCursor;state.postFocus=saved.postFocus;state.search=saved.search;state.filter=saved.filter;
    api?.setCurrentChannel(saved.channel,channelName(state.channels.find(channel=>channel.id===saved.channel))).catch(()=>{});
    renderShell();restorePosition(saved);
  }
  function paint() {
    $('#message-back')?.remove();$('#context-notice')?.remove();
    if(history.length&&$('.chat-header')){$('.chat-header').insertAdjacentHTML('afterbegin','<button type="button" class="navigation-back" id="message-back" aria-label="이전 채팅방과 위치로 돌아가기" title="이전 채팅방과 위치로 돌아가기">← 뒤로</button>');$('#message-back').onclick=back;}
    if(!state.postFocus||!$('#composer'))return;
    $('#composer').insertAdjacentHTML('beforebegin','<div class="context-notice" id="context-notice">공유된 원문 위치를 보고 있습니다.<button type="button" id="context-latest">최신 메시지로 이동 ↓</button></div>');$('#context-latest').onclick=()=>selectChannel(state.selected);
  }
  function reset(){ticket++;history=[];cancelRestore();paint();}
  document.addEventListener('keydown',event=>{if(event.altKey&&event.key==='ArrowLeft'&&history.length){event.preventDefault();back();}});
  return {open,openPost:id=>open(null,id),paint,back,reset};
})();
