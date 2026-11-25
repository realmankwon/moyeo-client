(function(root){
  const rich=typeof module!=='undefined'&&module.exports?require('./format.js'):root.RichText;
  function address(value,base){try{if(typeof value!=='string'||value.length>4096)return '';const url=new URL(value,base);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?url.href:'';}catch{return '';}}
  function imageAddress(value,base){if(typeof value==='string'&&/^\/(?!\/)(?:[^?#]*\/)?api\/v4\/image\?/.test(value)&&value.length<=4096){const proxy=new URL(value,'https://proxy.invalid');return proxy.pathname+proxy.search;}return address(value,base);}
  const text=(value,max)=>typeof value==='string'?value.trim().slice(0,max):'';
  function cards(post, publicMetadata){
    const urls=rich.links(post?.message||'').filter(url=>!/^https:\/\/(?:media\d*|i)\.giphy\.com\/.*\.(?:gif|webp)(?:[?#]|$)/i.test(url)).slice(0,3);
    const embeds=Array.isArray(post?.metadata?.embeds)?post.metadata.embeds:[];
    return urls.map(url=>{
      const embed=embeds.find(item=>item&&address(item.url)===url&&['opengraph','image','link'].includes(item.type));
      let data=embed?.data;if(!data||typeof data!=='object'||Array.isArray(data))data={};
      if(!data.title&&data[url]&&typeof data[url]==='object')data=data[url];
      const image=embed?.type==='image'?url:(Array.isArray(data.images)?data.images:[]).map(item=>imageAddress(item?.secure_url||item?.url,url)).find(Boolean)||'';
      const fallback=publicMetadata?.(url);
      return {url,site:text(data.site_name,100)||fallback?.site||new URL(url).hostname,title:text(data.title,300)||fallback?.title||new URL(url).hostname,description:text(data.description,600)||fallback?.description||'',image:image||fallback?.image||''};
    });
  }
  const api={cards,address};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.LinkPreviewData=api;
})(globalThis);
