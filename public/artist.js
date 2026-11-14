'use strict';(()=>{
 const $=id=>document.getElementById(id),status=$('artistStatus');
 const id=new URLSearchParams(location.search).get('id')||'';
 const ownerPreview=new URLSearchParams(location.search).get('preview')==='mine';
 const validId=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
 const el=(tag,text,cls)=>{const node=document.createElement(tag);if(cls)node.className=cls;node.textContent=text;return node;};
 function cutloopzPlatformName(hostname) {
   const host = String(hostname || '').toLowerCase().replace(/^www\./,'');
   const names = [
     ['youtube.com','YouTube'], ['youtu.be','YouTube'],
     ['spotify.com','Spotify'], ['open.spotify.com','Spotify'],
     ['tiktok.com','TikTok'], ['instagram.com','Instagram'],
     ['soundcloud.com','SoundCloud'], ['suno.com','Suno'],
     ['udio.com','Udio'], ['vimeo.com','Vimeo'],
     ['music.apple.com','Apple Music'], ['facebook.com','Facebook'],
     ['x.com','X'], ['twitter.com','X']
   ];
   for (const [domain,name] of names) {
     if (host === domain || host.endsWith('.' + domain)) return name;
   }
   return hostname.replace(/^www\./,'');
 }
 
 function addLink(container,value,kind){
  try{
   const url=new URL(value);
   if(url.protocol!=='https:' || url.username || url.password)return;
   const link=el('a',undefined,'artist-external-link');link.href=url.toString();link.target='_blank';link.rel='noopener noreferrer nofollow';
   link.append(el('span',cutloopzPlatformName(url.hostname)+' · '+kind),el('span','↗','artist-external-arrow'));
   container.append(link);
  }catch{}
 }
 async function show(){
  if(!ownerPreview&&!validId){status.textContent='This artist profile link is invalid. Browse the Creator Directory to find an artist.';return;}
  try{
   const response=await fetch(ownerPreview?'/api/customer-auth/creator-preview':'/api/customer-auth/creators/'+encodeURIComponent(id),{cache:'no-store',credentials:'same-origin'});
   const data=await response.json();
   if(!response.ok||!data.ok||!data.creator)throw Error('This profile is private, unpublished, or no longer available.');
   const profile=data.creator;
   if(ownerPreview && profile.visibility!=='public')$('ownerPrivateNotice').hidden=false;
   const avatar=$('publicArtistAvatar');
   if(typeof profile.avatar==='string' && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(profile.avatar) && profile.avatar.length<=76000){const img=document.createElement('img');img.alt='';img.src=profile.avatar;avatar.replaceChildren(img);}
   $('publicArtistName').textContent=profile.artistName||'Independent Artist';
   document.title=(profile.artistName||'Artist')+' | CutLoopz Media';
   $('publicArtistGenre').textContent=profile.genre||'Independent Music Artist';
   if(profile.bio){$('publicArtistBio').textContent=profile.bio;$('aboutSection').hidden=false;}
   const platforms=$('publicArtistPlatforms');
   for(const name of profile.platforms||[])platforms.append(el('span',name,'chip'));
   $('platformSection').hidden=!platforms.children.length;
   const links=$('publicArtistLinks');
   if(profile.artistPageUrl)addLink(links,profile.artistPageUrl,'Artist website');
   for(const video of profile.videoLinks||[])addLink(links,video,'Music video');
   for(const social of profile.socialLinks||[])addLink(links,social,'Music & social');
   $('artistLinksSection').hidden=!links.children.length;
   status.hidden=true;$('publicArtist').hidden=false;
  }catch(error){status.textContent=error.message||'Artist profile could not load.';}
 }
 show();
})();
