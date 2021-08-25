'use strict';
window.addEventListener("message", e => console.info(location.origin, "received", e.data, "from origin", e.origin));

window.addEventListener('DOMContentLoaded', () => {
  // Adds content to DOM needed because of isolation
  var script = document.createElement('script');
  script.setAttribute('type', 'text/javascript');
  script.setAttribute('crossorigin', 'anonymous');
  script.setAttribute('src', chrome.runtime.getURL('WindowScript.js'));
  document.head.appendChild(script);
}, {
  passive: true
});
