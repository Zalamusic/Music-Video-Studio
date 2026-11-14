'use strict';(()=>{
 const params=new URLSearchParams(location.search),share=params.get('share'),job=params.get('job');
 const video=document.getElementById('reviewVideo'),empty=document.getElementById('emptyScreen'),status=document.getElementById('cinemaStatus'),download=document.getElementById('downloadCinemaVideo'),shareButton=document.getElementById('shareCinemaVideo');
 const isId=s=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s||'');
 let activeShareUrl=isId(share)?location.origin+'/watch/'+encodeURIComponent(share):null;
 if(!isId(share)&&!isId(job))return;
 const url=isId(share)?'/stream/'+encodeURIComponent(share):'/api/cutloopz-production/local/jobs/'+encodeURIComponent(job)+'/video';
 const downloadUrl=isId(share)?'/download/'+encodeURIComponent(share):url;
 status.textContent='Checking your video access…';
 video.addEventListener('loadedmetadata',()=>{empty.hidden=true;video.classList.add('is-ready');download.hidden=false;download.href=downloadUrl;status.textContent='Your video is ready to review.';
  shareButton.hidden=false;shareButton.textContent=isId(share)?'Share review link':'Create 7-day review link';
 });
 video.addEventListener('error',()=>{video.classList.remove('is-ready');empty.hidden=false;status.textContent='This video is unavailable, the review link expired, or this account is not authorized. Sign in to the owner account or request a new link.';download.hidden=true;shareButton.hidden=true;});
 video.src=url;
 shareButton.addEventListener('click',async()=>{
  if(!activeShareUrl){
   if(!isId(job))return;
   shareButton.disabled=true;status.textContent='Creating a 7-day private review link…';
   try{
    const response=await fetch('/api/cutloopz-production/local/jobs/'+encodeURIComponent(job)+'/share',{method:'POST',credentials:'same-origin'});
    const result=await response.json();
    if(!response.ok||!result.ok||!/^\/watch\/[0-9a-f-]{36}$/i.test(result.url))throw Error(result.error||'Unable to create a share link.');
    activeShareUrl=location.origin+result.url;
    document.getElementById('cinemaShareManual').href=activeShareUrl;document.getElementById('cinemaShareFallback').hidden=false;
    shareButton.textContent='Share review link';status.textContent='Private review link created. It expires in seven days; anyone with the link can view it.';
   }catch(error){status.textContent=error.message||'Share link could not be created.';shareButton.disabled=false;return;}
   shareButton.disabled=false;
  }
  if(navigator.share){try{await navigator.share({title:'CutLoopz Artist Cinema',url:activeShareUrl});return;}catch(e){if(e.name==='AbortError')return;}}
  try{await navigator.clipboard.writeText(activeShareUrl);status.textContent='Private review link copied. Anyone with the link can view it until expiration.';}
  catch{status.textContent='Sharing is unavailable on this device. The 7-day link was created; please use a browser that supports Copy or Share.';}
 });
 if(isId(job))status.textContent='Private owner preview. Sign in with the authorized CutLoopz account. To share with others, first issue an expiring review link.';
})();
