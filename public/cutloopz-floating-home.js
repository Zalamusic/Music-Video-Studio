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
        left: max(15px, env(safe-area-inset-left, 0px));
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
          left: max(12px, env(safe-area-inset-left, 0px));
          bottom: max(14px, env(safe-area-inset-bottom, 0px));
        }
      }
      @media print { #cutloopzFloatingHome { display:none!important; } }
    `;
    document.head.appendChild(style);
    const link = document.createElement('a');
    link.id = 'cutloopzFloatingHome';
    link.href = '/customer.html#home';
    link.setAttribute('aria-label', 'Go to CutLoopz Home');
    link.title = 'Home';
    link.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m3 10 9-7 9 7"/><path d="M5 9.5V21h14V9.5"/><path d="M9 21v-7h6v7"/></svg>';
    document.body.appendChild(link);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, {once:true});
  else install();
})();
