'use strict';(()=>{
 const $=id=>document.getElementById(id), form=$('profileForm'),status=$('profileStatus');
 let avatarData='';
 const lines=id=>$(id).value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
 function display(profile,publicId){
  avatarData=profile?.avatar||'';showAvatar();
  $('viewMyProfile').hidden=!profile?.artistName;
  $('artistName').value=profile?.artistName||'';$('genre').value=profile?.genre||'';$('bio').value=profile?.bio||'';
  $('artistPageUrl').value=profile?.artistPageUrl||'';$('videoLinks').value=(profile?.videoLinks||[]).join('\n');
  $('socialLinks').value=(profile?.socialLinks||[]).join('\n');$('visibility').value=profile?.visibility||'private';
  document.querySelectorAll('#platformChoices input').forEach(el=>el.checked=(profile?.platforms||[]).includes(el.value));
 }
 function showAvatar(){
   const box=$('avatarPreview');box.replaceChildren();
   if(avatarData){const pic=document.createElement('img');pic.src=avatarData;pic.alt='Your profile picture';box.append(pic);}
   else box.textContent='♫';
 }
 const crop=$('avatarCropOverlay'),cropCanvas=$('avatarCropCanvas'),cropCtx=cropCanvas.getContext('2d');
 const zoomInput=$('avatarZoom');
 let workingImage=null, zoom=1,offsetX=0,offsetY=0,previousFocus=null;
 const pointers=new Map(),D=cropCanvas.width;
 function limit(){
   if(!workingImage)return;
   const scale=Math.max(D/workingImage.width,D/workingImage.height)*zoom;
   offsetX=Math.max(-(workingImage.width*scale-D)/2,Math.min((workingImage.width*scale-D)/2,offsetX));
   offsetY=Math.max(-(workingImage.height*scale-D)/2,Math.min((workingImage.height*scale-D)/2,offsetY));
 }
 function paint(ctx,size,circle){
   if(!workingImage)return;
   const scale=Math.max(size/workingImage.width,size/workingImage.height)*zoom;
   const sx=size/D;
   ctx.clearRect(0,0,size,size);ctx.save();
   if(circle){ctx.beginPath();ctx.arc(size/2,size/2,size/2-2,0,Math.PI*2);ctx.clip();}
   ctx.drawImage(workingImage,(size-workingImage.width*scale)/2+offsetX*sx,(size-workingImage.height*scale)/2+offsetY*sx,workingImage.width*scale,workingImage.height*scale);
   ctx.restore();
   if(circle){ctx.strokeStyle='#edcb83';ctx.lineWidth=3;ctx.beginPath();ctx.arc(size/2,size/2,size/2-2,0,Math.PI*2);ctx.stroke();}
 }
 function renderCrop(){limit();paint(cropCtx,D,true);zoomInput.value=String(zoom);}
 function closeCrop(){crop.hidden=true;pointers.clear();if(workingImage){workingImage.close?.();workingImage=null;}$('avatarFile').value='';previousFocus?.focus?.();}
 $('removeAvatar').addEventListener('click',()=>{avatarData='';$('avatarFile').value='';showAvatar();status.textContent='Picture removed. Save your artist profile to keep this change.';});
 $('avatarFile').addEventListener('change',async()=>{
   const file=$('avatarFile').files?.[0];if(!file)return;
   if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>8*1024*1024){status.textContent='Choose a PNG, JPEG or WebP picture smaller than 8 MB.';$('avatarFile').value='';return;}
   try{
     workingImage=await createImageBitmap(file);
     if(!workingImage.width||!workingImage.height||workingImage.width*workingImage.height>25000000)throw Error('Picture dimensions are unsupported.');
     previousFocus=document.activeElement;zoom=1;offsetX=0;offsetY=0;crop.hidden=false;renderCrop();cropCanvas.focus();
     status.textContent='Adjust the image, then choose Use This Photo.';
   }catch(error){if(workingImage){workingImage.close?.();workingImage=null;}crop.hidden=true;status.textContent='Could not open picture: '+error.message;$('avatarFile').value='';}
 });
 function canvasPoint(e){const r=cropCanvas.getBoundingClientRect();return{x:(e.clientX-r.left)*D/r.width,y:(e.clientY-r.top)*D/r.height};}
 const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
 cropCanvas.addEventListener('pointerdown',e=>{if(!workingImage)return;e.preventDefault();cropCanvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,canvasPoint(e));});
 cropCanvas.addEventListener('pointermove',e=>{
   if(!pointers.has(e.pointerId)||!workingImage)return;
   e.preventDefault();const old=pointers.get(e.pointerId),next=canvasPoint(e);
   if(pointers.size===1){offsetX+=next.x-old.x;offsetY+=next.y-old.y;}
   else {const other=[...pointers.entries()].find(([id])=>id!==e.pointerId)?.[1];if(other){const d0=distance(old,other),d1=distance(next,other);if(d0>1)zoom=Math.min(3,Math.max(1,zoom*d1/d0));}}
   pointers.set(e.pointerId,next);renderCrop();
 });
 for(const name of ['pointerup','pointercancel','lostpointercapture'])cropCanvas.addEventListener(name,e=>pointers.delete(e.pointerId));
 cropCanvas.addEventListener('keydown',e=>{const step=e.shiftKey?15:5;if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();if(e.key==='ArrowLeft')offsetX-=step;if(e.key==='ArrowRight')offsetX+=step;if(e.key==='ArrowUp')offsetY-=step;if(e.key==='ArrowDown')offsetY+=step;renderCrop();}});
 zoomInput.addEventListener('input',()=>{zoom=Number(zoomInput.value);renderCrop();});
 $('avatarCropCancel').addEventListener('click',closeCrop);
 crop.addEventListener('click',e=>{if(e.target===crop)closeCrop();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!crop.hidden)closeCrop();});
 $('avatarCropConfirm').addEventListener('click',()=>{
   if(!workingImage)return;
   const output=document.createElement('canvas');output.width=160;output.height=160;
   paint(output.getContext('2d'),160,false);
   const value=output.toDataURL('image/jpeg',0.72);
   if(value.length>76000){status.textContent='This picture could not be compressed enough. Choose another.';return;}
   avatarData=value;showAvatar();closeCrop();status.textContent='Picture adjusted. Tap Save Artist Profile to save it.';
 });
 async function init(){try{
  const r=await fetch('/api/customer-auth/creator-profile',{credentials:'same-origin',cache:'no-store'});
  if(r.status===401){$('signInPrompt').hidden=false;return;}
  const d=await r.json();if(!r.ok||!d.ok)throw Error(d.error||'Profile could not load.');
  form.hidden=false;display(d.profile,d.publicId);
 }catch(error){$('signInPrompt').hidden=false;$('signInPrompt').querySelector('p').textContent=error.message;}}
 form.addEventListener('submit',async event=>{
  event.preventDefault();const submit=$('saveProfile');submit.disabled=true;status.textContent='Saving your profile…';
  try{const profile={artistName:$('artistName').value,genre:$('genre').value,bio:$('bio').value,
   artistPageUrl:$('artistPageUrl').value.trim(),platforms:[...document.querySelectorAll('#platformChoices input:checked')].map(e=>e.value),
   videoLinks:lines('videoLinks'),socialLinks:lines('socialLinks'),visibility:$('visibility').value,avatar:avatarData};
   const r=await fetch('/api/customer-auth/creator-profile',{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({profile})});
   const d=await r.json();if(!r.ok||!d.ok)throw Error(d.error||'Unable to save your profile.');
   display(d.profile,d.publicId);status.textContent='Saved. '+(d.profile.visibility==='public'?'Your listing is visible in Creator Directory.':'Your listing is not public.');
  }catch(error){status.textContent=error.message;}finally{submit.disabled=false;}
 });init();
})();
