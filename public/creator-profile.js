'use strict';(()=>{
 const $=id=>document.getElementById(id), form=$('profileForm'),status=$('profileStatus');
 const lines=id=>$(id).value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
 function display(profile){
  $('artistName').value=profile?.artistName||'';$('genre').value=profile?.genre||'';$('bio').value=profile?.bio||'';
  $('photoUrl').value=profile?.photoUrl||'';$('artistPageUrl').value=profile?.artistPageUrl||'';$('videoLinks').value=(profile?.videoLinks||[]).join('\n');
  $('socialLinks').value=(profile?.socialLinks||[]).join('\n');$('visibility').value=profile?.visibility||'private';
  document.querySelectorAll('#platformChoices input').forEach(el=>el.checked=(profile?.platforms||[]).includes(el.value));
  const view=$('viewPublicProfile'); view.hidden=profile?.visibility!=='public';
  if(!view.hidden){view.href='/creator-directory.html?q='+encodeURIComponent(profile.artistName||'');}
 }
 async function init(){try{
  const r=await fetch('/api/customer-auth/creator-profile',{credentials:'same-origin',cache:'no-store'});
  if(r.status===401){$('signInPrompt').hidden=false;return;}
  const d=await r.json();if(!r.ok||!d.ok)throw Error(d.error||'Profile could not load.');
  form.hidden=false;display(d.profile);
 }catch(error){$('signInPrompt').hidden=false;$('signInPrompt').querySelector('p').textContent=error.message;}}
 form.addEventListener('submit',async event=>{
  event.preventDefault();const submit=$('saveProfile');submit.disabled=true;status.textContent='Saving your profile…';
  try{const profile={artistName:$('artistName').value,genre:$('genre').value,bio:$('bio').value,
   artistPageUrl:$('artistPageUrl').value.trim(),photoUrl:$('photoUrl').value.trim(),platforms:[...document.querySelectorAll('#platformChoices input:checked')].map(e=>e.value),
   videoLinks:lines('videoLinks'),socialLinks:lines('socialLinks'),visibility:$('visibility').value};
   const r=await fetch('/api/customer-auth/creator-profile',{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({profile})});
   const d=await r.json();if(!r.ok||!d.ok)throw Error(d.error||'Unable to save your profile.');
   display(d.profile);status.textContent='Saved. '+(d.profile.visibility==='public'?'Your listing is visible in Creator Directory.':'Your listing is not public.');
  }catch(error){status.textContent=error.message;}finally{submit.disabled=false;}
 });init();
})();
