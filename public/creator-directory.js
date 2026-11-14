'use strict';(()=>{
 const list=document.getElementById('creatorList'),input=document.getElementById('searchCreators'),message=document.getElementById('directoryStatus');
 let creators=[];
 const el=(tag,text,cls)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
 const validId=id=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id||'');
 function render(){
  const query=input.value.toLocaleLowerCase().trim();
  const matches=creators.filter(c=>[c.artistName,c.bio,c.genre,...(c.platforms||[])].join(' ').toLocaleLowerCase().includes(query));
  list.replaceChildren();
  message.textContent=matches.length?`${matches.length} artist${matches.length===1?'':'s'} found.`:creators.length===0?'No public CutLoopz artist profiles yet. Artists must publish their profiles before they appear here.':'No public artists match this search. Try a different artist name, genre, or platform.';
  for(const creator of matches){
   if(!validId(creator.id))continue;
   const card=el('a',undefined,'creator-card creator-result');
   card.href='/artist.html?id='+encodeURIComponent(creator.id);
   card.setAttribute('aria-label','View '+creator.artistName+' artist profile');
   const details=el('div',undefined,'creator-result-body');
   details.append(el('h2',creator.artistName));
   if(creator.genre)details.append(el('p',creator.genre,'small'));
   if(creator.platforms?.length)details.append(el('p',creator.platforms.slice(0,3).join(' · '),'small creator-result-platforms'));
   card.append(details,el('span','›','creator-result-arrow'));
   list.append(card);
  }
 }
 async function load(){try{
  const response=await fetch('/api/customer-auth/creators',{cache:'no-store'});
  const data=await response.json();if(!response.ok||!data.ok)throw Error(data.error||'Could not load Creator Directory');
  creators=data.creators||[];render();
 }catch(error){message.textContent='Directory temporarily unavailable: '+error.message;}}
 input.value=new URLSearchParams(location.search).get('q')||'';
 input.addEventListener('input',render);load();
})();
