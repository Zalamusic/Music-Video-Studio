
/* CutLoopz: accessible, always-visible Home shortcut across customer pages.
 * Navigates to the actual home page; does not discard Studio drafts or invoke generation.
 */
(() => {
  'use strict';
  function install() {
    if (!document.body || document.getElementById('cutloopzFloatingHome')) return;
    const style = document.createElement('style');
    style.id = 'cutloopzFloatingHomeStyle';
    style.textContent = `
      #cutloopzFloatingHome {
        position: fixed;
        z-index: 950;
        left: calc(50% - 83px);
        bottom: max(17px, env(safe-area-inset-bottom, 0px));
        width: 50px;
        height: 50px;
        display: flex;
        justify-content: center;
        align-items: center;
        padding: 0;
        border: 2px solid #ffe1a0;
        border-radius: 50%;
        background: linear-gradient(135deg,#f4cd7e,#bb893d);
        color: #20160a;
        box-shadow: 0 5px 20px rgba(0,0,0,.5);
        text-decoration: none;
        -webkit-tap-highlight-color: transparent;
        touch-action: manipulation;
      }
      #cutloopzFloatingHome svg { width: 25px; height: 25px; display: block; flex: none; }
      #cutloopzFloatingHome:hover { filter: brightness(1.08); }
      #cutloopzFloatingHome:focus-visible { outline: 3px solid #fff3d7; outline-offset: 3px; }
      @media (max-width:600px) {
        #cutloopzFloatingHome {
          width: 48px;
          height: 48px;
          left: calc(50% - 83px);
          bottom: max(14px, env(safe-area-inset-bottom, 0px));
        }
      }
      #cutloopzProfileReturn {
        position: fixed;
        z-index: 950;
        left: calc(50% - 23px);
        bottom: max(24px, calc(env(safe-area-inset-bottom, 0px) + 7px));
        display: inline-flex;
        justify-content: center;
        align-items: center;
        min-height: 36px;
        padding: 6px 12px;
        border: 1px solid #d6aa61;
        border-radius: 999px;
        background: #19151b;
        color: #f3d69d;
        font: 700 12px/1.2 Arial, sans-serif;
        white-space: nowrap;
        box-shadow: 0 5px 17px rgba(0,0,0,.36);
        text-decoration: none;
        -webkit-tap-highlight-color: transparent;
        touch-action: manipulation;
      }
      #cutloopzProfileReturn:hover { background:#312517; }
      #cutloopzProfileReturn:focus-visible { outline:3px solid #fff3d7;outline-offset:3px; }
      @media print { #cutloopzFloatingHome, #cutloopzProfileReturn { display:none!important; } }
    `;
    document.head.appendChild(style);
    const link = document.createElement('a');
    link.id = 'cutloopzFloatingHome';
    link.href = '/customer.html';
    link.setAttribute('aria-label', 'Go to CutLoopz Home');
    link.title = 'Home';
    link.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m3 10 9-7 9 7"/><path d="M5 9.5V21h14V9.5"/><path d="M9 21v-7h6v7"/></svg>';
    document.body.appendChild(link);

    // The account page IS My Profile. Every other customer page has one
    // consistent, unobtrusive return shortcut beside the existing Home control.
    // Signed-out visitors can use the same link to reach the sign-in screen.
    if (!/^\/account\.html$/i.test(window.location.pathname)) {
      const profile = document.createElement('a');
      profile.id = 'cutloopzProfileReturn';
      profile.href = '/account.html';
      profile.textContent = 'My Profile';
      profile.title = 'Return to My Profile';
      profile.setAttribute('aria-label', 'Return to My Profile and Creative Home');
      document.body.appendChild(profile);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, {once:true});
  else install();
})();
