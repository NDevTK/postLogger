// Code here is exposed to the website.
(function() {
'use strict';

const windows = new Map();
const iframes = new Set();

function whois(win, origin) {
 if (win === window.top) return 'top (' + origin + ')';
 if (win === window.parent) return 'parent (' + origin + ')';
 if (win === window.opener) return 'opener (' + origin + ')';
 return 'other (' + origin + ')';
}

const me = whois(window, window.origin);

window.addEventListener("message", e => {
 console.info(me, "received", e.data, "from ", whois(e.source, e.origin));
};

function hookIframe(iframe) {
  if (iframes.has(iframe)) return;
  const iframeProxy = {
    get(target, prop, receiver) {
      let result = Reflect.get(...arguments);
      if (prop !== 'contentWindow') return result;
      return new Proxy(result, handle('iframe', iframe));
    },
  };
  iframe.__proto__ = new Proxy(iframe.__proto__, iframeProxy);
  iframes.add(iframe);
}

setInterval(() => {
  document.querySelectorAll('iframe').forEach(hookIframe);
}, 100);

function handle(type, iframe) {
  return {
    get: function(target, property) {
      if (property !== "postMessage") return Reflect.get(...arguments);
      return function() {
        hook(arguments, type, iframe);
        return target[property].apply(target, arguments);
      }
    },
  };
}

function hasProperty(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function hookWindow(w, p) {
  if (hasProperty(w, p)) {
    if (!(w[p] instanceof Window)) return;
    let real = w[p];
    if (windows.has(real)) {
      w[p] = windows.get(real);
    } else {
      w[p] = new Proxy(real, handle(p));
      windows.set(real, w);
    }
  }
}

function hookWindows(w) {
  if (!(w instanceof Window)) return;

  hookWindow(w, "parent");
  hookWindow(w, "opener");

  if (hasProperty(w, "postMessage")) {
    let real = w.postMessage;
    if (windows.has(real)) {
      w.postMessage = windows.get(real);
    } else {
      w.postMessage = function() {
        hook(arguments, "self");
        real.apply(this, arguments);
      }
      windows.set(real, w);
    }
  }
}

hookWindows(window);

function hook(data, type, iframe) {
  if (type === "self") return console.info(me, "sent", data[0], "with scope", data[1], "to self");
  if (type === "opener" && data[1] === "*") return console.warn(sender, "sent", data[0], "with scope", data[1], "to opener");
  if (type === "opener") return console.info(me, "sent", data[0], "with scope", data[1], "to opener");
  if (type === "iframe" && data[1] === "*") return console.warn(sender, "sent", data[0], "with scope", data[1], "to iframe", iframe);
  if (type === "iframe") return console.info(me, "sent", data[0], "with scope", data[1], "to iframe", iframe);
  if (type === "parent" && data[1] === "*") return console.warn(sender, "sent", data[0], "with scope", data[1], "to parent");
  if (type=== "parent") return console.info(me, "sent", data[0], "with scope", data[1], "to parent");
}

})();
