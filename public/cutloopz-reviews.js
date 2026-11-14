
(()=>{'use strict';
const form=document.getElementById('reviewForm');if(!form)return;
const rating=document.getElementById('rating'),text=document.getElementById('reviewMessage'),status=document.getElementById('reviewStatus'),submit=document.getElementById('reviewSubmit');
const stars=Array.from(form.querySelectorAll('.star'));
function selectRating(value){rating.value=String(value);for(const star of stars){const n=Number(star.dataset.value);star.classList.toggle('selected',n<=value);star.setAttribute('aria-pressed',String(n===value));}}
for(const star of stars)star.addEventListener('click',()=>selectRating(Number(star.dataset.value)));
form.addEventListener('submit',async e=>{e.preventDefault();const score=Number(rating.value);const message=text.value.trim();status.className='status';if(!Number.isInteger(score)||score<1||score>5){status.textContent='Please choose a star rating.';status.classList.add('error');return}if(message.length<10){status.textContent='Please write at least 10 characters.';status.classList.add('error');return}submit.disabled=true;status.textContent='Sending your private review…';try{const r=await fetch('/api/cutloopz-reviews',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({rating:score,message})});const data=await r.json();if(!r.ok||!data.ok)throw Error(data.error||'Review could not be saved.');status.textContent='Thank you for sharing your experience! Your private note is safely received. 💛';status.classList.add('ok');text.value='';selectRating(0);}catch(err){status.textContent=err.message||'Please try again.';status.classList.add('error');}finally{submit.disabled=false}});
// If the signed-in customer is the owner, provide a link to the separate, private dashboard.
fetch('/api/cutloopz-reviews/admin',{credentials:'same-origin',cache:'no-store'}).then(r=>{if(r.ok)document.getElementById('ownerLink').hidden=false}).catch(()=>{});
})();
