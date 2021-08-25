'use strict';
window.addEventListener("message", e => console.info(location.origin, "received", e.data, "from origin", e.origin));
var script = document.createElement('script');
script.setAttribute('type', 'text/javascript');
script.setAttribute('crossorigin', 'anonymous');
script.setAttribute('src', chrome.runtime.getURL('WindowScript.js'));
document.head.appendChild(script);
