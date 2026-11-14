'use strict';(()=>{
const $=id=>document.getElementById(id), steps=$('rewardSteps');
const colors=['#ce8d5f','#e9a76d','#76acf0','#b995ed','#ebc771','#49ec87'];
function render(count,unlocked,active){
 count=Math.max(0,Math.min(6,Number(count)||0));
 $('rewardCount').textContent=count+' / 6';$('rewardTrack').setAttribute('aria-valuenow',String(count));
 $('rewardFill').style.width=(count/6*100)+'%';$('rewardFill').style.background=count?colors[count-1]:'#9c825d';
 steps.replaceChildren();colors.forEach((color,i)=>{const span=document.createElement('span');span.className='reward-step'+(i<count?' earned':'')+(i+1===count?' current':'');span.textContent=i+1;span.style.background=i<count?color:'';span.setAttribute('aria-label','Milestone '+(i+1)+(i<count?', completed':', pending'));steps.append(span);});
 $('rewardMessage').textContent=unlocked?'🎉 Platinum Hitmaker unlocked! You earned your insignia and reached the qualifying milestone for the seventh-video 20% reward.':count?`${6-count} more qualifying ${6-count===1?'video':'videos'} to your Platinum Hitmaker achievement!`:'Your journey begins with your first qualifying completed paid video.';
 $('rewardTitle').textContent=unlocked?'Platinum Hitmaker!':'Your Journey to Platinum';
 $('rewardCaution').textContent=active?'Your discount is active; review it at checkout.':'Discount redemption is not yet active; eligibility does not automatically apply a discount.';
 $('rewardStatus').textContent='Verified progress from completed paid videos';$('rewardStatus').className='status';
 document.querySelector('.rewards-panel').classList.toggle('complete',count===6&&unlocked);
}
(async()=>{try{
 const r=await fetch('/api/customer-order-history',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
 if(r.status===401){$('rewardStatus').textContent='Sign in to see your private rewards.';const link=document.createElement('a');link.href='/account.html?return=rewards';link.textContent='Sign in to My Account';link.className='btn';$('rewardStatus').after(link);return;}
 const data=await r.json();if(!r.ok||!data.ok)throw Error(data.error||'Rewards unavailable.');
 render(data.loyalty?.qualifyingVideos||0,data.loyalty?.platinumUnlocked===true,data.loyalty?.discountActive===true);
 }catch(e){$('rewardStatus').textContent='We could not load your private rewards. Please try again later.';}})();
})();