'use strict';
var script = document.createElement('script');
script.setAttribute('type', 'text/javascript');
script.setAttribute('crossorigin', 'anonymous');
script.setAttribute('src', chrome.runtime.getURL('WindowScript.js'));
document.head.appendChild(script);
