'use strict';(()=>{
 const $=id=>document.getElementById(id),form=$('recoveryForm'),button=$('recoverySubmit'),error=$('recoveryError');
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(button.disabled)return;
  error.hidden=true;button.disabled=true;button.textContent='Sending secure request…';
  try{
   const response=await fetch('/api/customer-auth/forgot-password',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({email:$('recoveryEmail').value.trim()})});
   const data=await response.json();if(!response.ok||!data.ok)throw Error(data.error||'Unable to send reset request.');
   form.hidden=true;$('recoveryResult').hidden=false;$('recoveryTitle').textContent='Your Request Is In!';
   $('recoveryInfo').textContent='Your account privacy matters to us.';
  }catch(e){error.textContent=e.message||'Please try again later.';error.hidden=false;}
  finally{button.disabled=false;button.textContent='Send My Reset Link';}
 });
})();