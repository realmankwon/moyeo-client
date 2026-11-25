const {test}=require('node:test'),assert=require('node:assert/strict');const RichText=require('../src/format.js'),{cards,address}=require('../src/link-preview-data.js'),{MattermostClient}=require('../electron/client.cjs');
test('mention tokens are distinct from email, code and URL text',()=>{
 const html=RichText.render('안녕 **@alice** (@bob.smith) @channel @here @all user@example.com `@code` https://example.org/@path [@label](https://example.org/@route)');
 assert.ok(html.includes('data-user-mention="alice"'));assert.ok(html.includes('data-user-mention="bob.smith"'));assert.equal((html.match(/mention-group/g)||[]).length,3);
 for(const name of ['example.com','code','path','route','label'])assert.ok(!html.includes('data-user-mention="'+name+'"'));
 assert.ok(html.includes('<strong><button'));assert.ok(!RichText.render('```text\n@alice\n```').includes('data-user-mention'));
 assert.ok(!RichText.render('hello@alice foo/@bob').includes('data-user-mention'));assert.ok(!RichText.render('@alice<script>bad</script>').includes('<script>'));
});
test('link cards honor source URLs, deduplicate, escape at display and reject unsafe images',()=>{
 const message='[원문](https://example.org/a) https://example.org/a, `https://hidden.org`\n```\nhttps://hidden2.org\n```';
 assert.deepEqual(RichText.links(message),['https://example.org/a']);
 const post={message,metadata:{embeds:[{type:'opengraph',url:'https://example.org/a',data:{url:'javascript:evil',title:'<img onerror=evil>',description:'내용',site_name:'사이트',images:[{url:'javascript:evil'},{secure_url:'/cover.png'}]}}]}};
 assert.deepEqual(cards(post),[{url:'https://example.org/a',site:'사이트',title:'<img onerror=evil>',description:'내용',image:'https://example.org/cover.png'}]);
 assert.equal(cards({message:'https://example.org/a',metadata:{embeds:[{type:'opengraph',url:'https://attacker.org/',data:{title:'Wrong'}}]}})[0].title,'example.org');
 assert.equal(cards({message:'https://one.org https://two.org https://three.org https://four.org'}).length,3);
 assert.equal(cards({message:'https://media.giphy.com/media/gifA/200.gif'}).length,0);
 for(const value of ['javascript:x','file:///secret','https://user:secret@example.org'])assert.equal(address(value),'');
 assert.equal(cards({message:'https://example.org/',metadata:{embeds:[{type:'opengraph',url:'https://example.org/',data:{images:[{url:'/api/v4/image?url=https%3A%2F%2Fcdn.org%2Fa.png'}]}}]}})[0].image,'/api/v4/image?url=https%3A%2F%2Fcdn.org%2Fa.png');
});
test('preview image requests go through authenticated Mattermost proxy with no redirects',async()=>{
 const calls=[],client=new MattermostClient(async(url,options)=>{calls.push({url,options});return new Response('image',{headers:{'Content-Type':'image/png'}});});client.server='https://chat.example.org/mm';client.token='private';client.me={id:'a'.repeat(26)};
 await client.linkPreviewImageResponse('https://cdn.example.org/cover.png');const call=calls[0],url=new URL(call.url);assert.equal(url.origin,'https://chat.example.org');assert.equal(url.pathname,'/mm/api/v4/image');assert.equal(url.searchParams.get('url'),'https://cdn.example.org/cover.png');assert.equal(call.options.headers.Authorization,'Bearer private');assert.equal(call.options.redirect,'error');
 await client.linkPreviewImageResponse('/mm/api/v4/image?url=https%3A%2F%2Fcdn.example.org%2Fimage.png');assert.equal(calls[1].url,'https://chat.example.org/mm/api/v4/image?url=https%3A%2F%2Fcdn.example.org%2Fimage.png');
 await assert.rejects(client.linkPreviewImageResponse('file:///secret'),/주소/);await assert.rejects(client.userByUsername('../bad'),/이름/);
});
