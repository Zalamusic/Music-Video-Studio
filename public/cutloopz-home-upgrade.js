/**
 * CutLoopz Media — Homepage clarity update
 * Non-payment, presentation-only enhancement.
 * Does not modify customer-auth routes, studio uploads, or video production.
 */
(() => {
 'use strict';
 function installProfileLabels() {
 document.querySelectorAll('[data-profile]').forEach(profile => {
 const trigger = profile.querySelector('[data-profile-trigger]');
 if (!trigger || profile.querySelector('.cutloopz-studio-label')) return;
 // Visual cue only: the existing avatar remains the sole menu trigger.
 const label = document.createElement('span');
 label.className = 'cutloopz-studio-label';
 label.textContent = 'My Studio';
 label.setAttribute('aria-hidden', 'true');
 trigger.insertAdjacentElement('afterend', label);
 });
 }
 function installPricing() {
 const pricing = document.getElementById('pricing');
 const panel = pricing?.querySelector('.panel');
 if (!panel || panel.dataset.cutloopzPriceUpdate === 'v1') return;
 // Fixed approved public display amounts. Actual charging remains disabled.
 panel.innerHTML = `
 <div class="cutloopz-price-header">
 <div>
 <h3>Full-Length Cinematic Music Video</h3>
 <p class="cutloopz-price-note">One video. No subscription required.</p>
 </div>
 <div class="cutloopz-video-price" aria-label="79 dollars and 99 cents per video">
 <strong>$79.99</strong><span>per video</span>
 </div>
 </div>
 <p>Bring your music and creative vision to life. Video production is
 purchased separately from optional Glamour membership.</p>
 <div class="cutloopz-glamour-price-section">
 <h3>Glamour Membership <span class="cutloopz-optional">Optional</span></h3>
 <p>Unlock up to five total approved reference photos, wardrobe
 choices, and scene-by-scene glamour direction.</p>
 <div class="cutloopz-member-prices" aria-label="Prepaid Glamour membership options">
 <div><span>1 month</span><strong>$24.99</strong></div>
 <div><span>3 months</span><strong>$69.99</strong></div>
 <div><span>6 months</span><strong>$129.99</strong></div>
 <div><span>1 year</span><strong>$239.99</strong></div>
 </div>
 <p class="cutloopz-price-note">Paid upfront. No automatic renewal.
 Membership does not include a video purchase.</p>
 <a class="cutloopz-glamour-link" href="/glamour.html">
 Explore Glamour Membership
 </a>
 </div>
 <p class="cutloopz-price-note cutloopz-coming-soon">
 Customer checkout is not yet available. No payment is collected on this preview.
 </p>`;
 panel.dataset.cutloopzPriceUpdate = 'v1';
 }
 function installStyles() {
 if (document.getElementById('cutloopz-home-upgrade-styles')) return;
 const style = document.createElement('style');
 style.id = 'cutloopz-home-upgrade-styles';
 style.textContent = `
 /* Profile label: visible but never a second clickable control. */
 [data-profile].customer-profile {
 display: flex;
 flex-direction: column;
 align-items: center;
 justify-content: center;
 gap: 2px; }
 [data-profile].customer-profile[hidden] { display: none !important; }
 .cutloopz-studio-label {
 display: block;
 color: var(--blue-dark, #1556b4);
 font: 700 11px/1.25 "DM Sans", Arial, sans-serif;
 text-align: center;
 white-space: nowrap;
 user-select: none;
 pointer-events: none;
 }
 .floating-profile .cutloopz-studio-label { font-size: 10px; }
 .cutloopz-price-header {
 display: flex;
 align-items: center;
 justify-content: space-between;
 flex-wrap: wrap;
 gap: 12px;
 }
 .cutloopz-price-header h3 { margin-bottom: 3px; }
 .cutloopz-video-price {
 display: flex;
 flex-direction: column;
 align-items: flex-start;
 background: var(--soft, #f4f8fe);
 border: 1px solid var(--line, #d8e3f0);
 border-radius: 13px;
 padding: 10px 16px;
 min-width: 150px;
 }
 .cutloopz-video-price strong {
 color: var(--navy, #17263c);
 font-size: clamp(25px, 5vw, 33px);
 line-height: 1.15;
 }
 .cutloopz-video-price span,
 .cutloopz-price-note { color: var(--muted, #3f5067); font-size: 13px; }
 .cutloopz-glamour-price-section {
 border-top: 1px solid var(--line, #d8e3f0);
 margin-top: 18px;
 padding-top: 18px;
 }
 .cutloopz-optional {
 color: var(--blue-dark, #1556b4);
 font-size: 12px;
 font-weight: 700;
 margin-left: 6px;
 }
 .cutloopz-member-prices {
 display: grid;
 grid-template-columns: repeat(4, minmax(0, 1fr));
 gap: 9px;
 margin: 13px 0;
 }
 .cutloopz-member-prices > div {
 border: 1px solid var(--line, #d8e3f0);
 border-radius: 11px;
 background: var(--soft, #f4f8fe);
 padding: 12px 10px;
 min-width: 0;
 }
 .cutloopz-member-prices span,
 .cutloopz-member-prices strong { display: block; }
 .cutloopz-member-prices span {
 font-size: 12px;
 color: var(--muted, #3f5067);
 }
 .cutloopz-member-prices strong {
 font-size: 20px;
 color: var(--navy, #17263c);
 }
 .cutloopz-glamour-link {
 display: inline-flex;
 min-height: 44px; align-items: center;
 border: 2px solid var(--blue, #2469cc);
 border-radius: 10px;
 color: var(--blue-dark, #1556b4);
 background: #fff;
 padding: 9px 14px;
 font-weight: 700;
 }
 .cutloopz-glamour-link:hover,
 .cutloopz-glamour-link:focus-visible {
 background: var(--soft, #f4f8fe);
 }
 .cutloopz-coming-soon { margin-top: 16px; }
 @media (max-width: 650px) {
 .cutloopz-member-prices { grid-template-columns: repeat(2, minmax(0, 1fr)); }
 }
 @media (max-width: 360px) {
 .cutloopz-studio-label { font-size: 10px; }
 .cutloopz-member-prices strong { font-size: 18px; }
 }`;
 document.head.appendChild(style);
 }
 function ready() {
 installStyles();
 installProfileLabels();
 installPricing();
 }
 if (document.readyState === 'loading') {
 document.addEventListener('DOMContentLoaded', ready, { once: true });
 } else {
 ready();
 }
})();
