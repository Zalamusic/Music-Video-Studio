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
  const view=$('viewPublicProfile'); view.hidden=profile?.visibility!=='public';
  if(!view.hidden && /^[0-9a-f-]{36}$/i.test(publicId||'')){view.href='/artist.html?id='+encodeURIComponent(publicId);}else view.hidden=true;
 }
 function showAvatar(){
   const box=$('avatarPreview');box.replaceChildren();
   if(avatarData){const pic=document.createElement('img');pic.src=avatarData;pic.alt='Your profile picture';box.append(pic);}
   else box.textContent='♫';
 }
 $('removeAvatar').addEventListener('click',()=>{avatarData='';$('avatarFile').value='';showAvatar();});
 $('avatarFile').addEventListener('change',async()=>{
  const file=$('avatarFile').files?.[0];if(!file)return;
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>8*1024*1024){status.textContent='Choose a PNG, JPEG or WebP picture smaller than 8 MB.';return;}
  try{
   const img=await createImageBitmap(file);
   const side=Math.min(img.width,img.height);const canvas=document.createElement('canvas');
   canvas.width=160;canvas.height=160;const ctx=canvas.getContext('2d');
   ctx.drawImage(img,(img.width-side)/2,(img.height-side)/2,side,side,0,0,160,160);img.close?.();
   const resized=canvas.toDataURL('image/jpeg',0.72);
   if(resized.length>76000)throw Error('Profile picture is too large after resizing.');
   avatarData=resized;showAvatar();status.textContent='Picture ready. Tap Save Artist Profile to keep it.';
  }catch(error){status.textContent='Could not process picture: '+error.message;}
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
