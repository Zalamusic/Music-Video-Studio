'use strict';(()=>{
 const list=document.getElementById('creatorList'),input=document.getElementById('searchCreators'),message=document.getElementById('directoryStatus');let creators=[];
 const el=(tag,text,cls)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
 function links(parent, urls, label){for(const [index,url] of urls.entries()){
  let parsed;try{parsed=new URL(url);if(parsed.protocol!=='https:')continue;}catch{continue;}
  const link=el('a',label?label:parsed.hostname.replace(/^www\./,'')+(urls.length>1?' '+(index+1):''));
  link.href=parsed.toString();link.target='_blank';link.rel='noopener noreferrer nofollow';parent.append(link);
 }}
 function render(){const query=input.value.toLocaleLowerCase().trim();const matches=creators.filter(c=>[c.artistName,c.bio,c.genre,...(c.platforms||[])].join(' ').toLocaleLowerCase().includes(query));
  list.replaceChildren();message.textContent=matches.length?`${matches.length} artist${matches.length===1?'':'s'} found.`:creators.length===0?'No public CutLoopz artist profiles yet. Artists must publish their profiles before they appear here.':'No public artists match this search. Try a different artist name, genre, or platform.';
  for(const creator of matches){const card=el('article',undefined,'creator-card');
    card.append(el('h2',creator.artistName));
    if(creator.genre)card.append(el('p',creator.genre,'small'));
    const chips=el('div',undefined,'chips');(creator.platforms||[]).forEach(p=>chips.append(el('span',p,'chip')));card.append(chips);
    if(creator.bio)card.append(el('p',creator.bio));
    const external=el('div',undefined,'external-links');
    if(creator.artistPageUrl)links(external,[creator.artistPageUrl],'Artist page');
    links(external,creator.videoLinks||[],null);links(external,creator.socialLinks||[],null);
    if(external.children.length)card.append(external);list.append(card);
  }
 }
 async function load(){try{const r=await fetch('/api/customer-auth/creators',{cache:'no-store'});const d=await r.json();if(!r.ok||!d.ok)throw Error(d.error||'Could not load Creator Directory');creators=d.creators||[];render();}
  catch(error){message.textContent='Directory temporarily unavailable: '+error.message;}}
 input.value=new URLSearchParams(location.search).get('q')||'';input.addEventListener('input',render);load();
})();
