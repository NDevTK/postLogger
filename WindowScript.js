// Code here is exposed to the website.
(function() {
'use strict';

const windows = new Map();
const iframes = new Set();
 
function hookIframe(iframe) {
  if (iframes.has(iframe)) return;
  iframe.__proto__ = new Proxy(iframe.__proto__, handle('iframe'));
  iframes.add(iframe);
}

setInterval(() => {
  document.querySelectorAll('iframe').forEach(hookIframe);
}, 100);

function handle(type) {
  return {
    get: function(target, property) {
     const result = Reflect.get(...arguments);
     if (property === 'isProxy') return true;
     if (typeof property == 'undefined') return;
     if (!property.isProxy && typeof property === 'object') target[key] = new Proxy(result, handle(type));
     if (property !== 'postMessage') return result;
      return function() {
        hook(arguments, type);
        return result.apply(target, arguments);
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

function hook(data, type) {
  if (type === "self") return console.info(location.origin, "sent", data[0], "with scope", data[1], "to self");
  if (type === "opener" && data[1] === "*") return console.warn(location.origin, "sent", data[0], "with scope", data[1], "to opener");
  if (type === "opener") return console.info(location.origin, "sent", data[0], "with scope", data[1], "to opener");
  if (type === "iframe" && data[1] === "*") return console.warn(location.origin, "sent", data[0], "with scope", data[1], "to iframe");
  if (type === "iframe") return console.info(location.origin, "sent", data[0], "with scope", data[1], "to iframe");
  if (type === "parent" && data[1] === "*") return console.warn(location.origin, "sent", data[0], "with scope", data[1], "to parent");
  if (type=== "parent") return console.info(location.origin, "sent", data[0], "with scope", data[1], "to parent");
}

})();
