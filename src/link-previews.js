const linkPreviews=(()=>{
  let cache=new Map(),pending=new Map();
  const signature=post=>String(post.edit_at||0)+'\n'+post.message;
  function resolved(post){const saved=cache.get(post.id);return !Object.hasOwn(post.metadata||{},'embeds')&&saved?.signature===signature(post)?{...post,metadata:saved.metadata}:post;}
  function body(post){return LinkPreviewData.cards(resolved(post)).map(card=>{
    let image='';if(card.image&&state.me?.avatar_url){const session=new URL(state.me.avatar_url).hostname,encoded=btoa(card.image).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');image=`<span class="link-preview-image"><img src="moyeo-media://${session}/link-preview/${encoded}" alt="${esc(card.title)} 대표 이미지" loading="lazy" decoding="async"></span>`;}
    return `<button type="button" class="message-link-preview" data-link="${esc(card.url)}" aria-label="${esc(card.title)} 링크 열기">${image}<span class="link-preview-copy"><small>${esc(card.site)}</small><strong>${esc(card.title)}</strong>${card.description?`<span>${esc(card.description)}</span>`:''}<small class="link-preview-address">${esc(card.url)}</small></span></button>`;
  }).join('');}
  function markup(post){const content=body(post);return content?`<div class="message-link-previews" data-preview-post="${esc(post.id)}">${content}</div>`:'';}
  async function hydrate(posts){if(state.demo||!api?.post)return;let cursor=0;const epoch=state.generation;
    const candidates=posts.filter(post=>!Object.hasOwn(post.metadata||{},'embeds')&&LinkPreviewData.cards(post).length&&cache.get(post.id)?.signature!==signature(post));
    await Promise.all(Array.from({length:Math.min(3,candidates.length)},async()=>{while(cursor<candidates.length){const post=candidates[cursor++],key=post.id+':'+signature(post),jobs=pending;if(epoch!==state.generation)return;let task=jobs.get(key);if(!task){task=api.post(post.id).catch(()=>null);jobs.set(key,task);}const full=await task;jobs.delete(key);if(epoch!==state.generation)return;
      if(cache.get(post.id)?.signature===signature(post))continue;
      cache.set(post.id,{signature:signature(post),metadata:full?.metadata||{embeds:[]}});while(cache.size>300)cache.delete(cache.keys().next().value);
      if(!state.posts.some(item=>item.id===post.id&&signature(item)===signature(post)))continue;
      const area=$('#messages'),nearBottom=area&&area.scrollHeight-area.scrollTop-area.clientHeight<100,top=area?.getBoundingClientRect().top||0,anchor=area&&[...area.querySelectorAll('[data-message-id]')].find(node=>node.getBoundingClientRect().bottom>top),offset=anchor?.getBoundingClientRect().top;
      document.querySelectorAll('[data-preview-post="'+post.id+'"]').forEach(node=>{node.innerHTML=body(post);});
      if(area){if(nearBottom)area.scrollTop=area.scrollHeight;else if(anchor?.isConnected)area.scrollTop+=anchor.getBoundingClientRect().top-offset;}
    }}));
  }
  document.addEventListener('error',event=>{if(event.target.matches?.('.link-preview-image img')){event.target.style.visibility='hidden';event.target.parentElement.classList.add('image-unavailable');}},true);
  function reset(){cache=new Map();pending=new Map();}
  return {markup,hydrate,reset};
})();
