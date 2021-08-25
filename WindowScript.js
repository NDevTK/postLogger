// Code here is exposed to the website.
(function() {
'use strict';

const windows = new Map();

function handle(type, key = "postMessage") {
  return {
    get: function(target, property) {
      if (property !== key) return target[property];
      return function() {
        hook(arguments, type);
        let result = target[property].apply(target, arguments);
        if (result.source) hookWindow(result.source);
        return result;
      }
    },
  };
}

function hookWindow(w) {
  if (!w) return;
  
  if (w.opener) {
    let real = w.opener;
    if (windows.has(real)) {
      w.opener = windows.get(real);
    } else {
      w.opener = new Proxy(real, handle("opener"));
      windows.set(real, w);
    }
  }
  
  if (w.parent) {
    let real = w.parent;
    if (windows.has(real)) {
      w.parent = windows.get(real);
    } else {
      w.parent = new Proxy(real, handle("parent"));
      windows.set(real, w);
    }
  }
  
  if (w) {
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

hookWindow(window);

function hook(data, type) {
  if (type === "self") return console.info(location.origin, "sent", data[0], "with scope", data[1], "to self");
  if (type === "opener" && data[1] === "*") return console.warn(location.origin, "sent", data[0], "with scope", data[1], "to opener");
  if (type === "opener") return console.info(location.origin, "sent", data[0], "with scope", data[1], "to opener");
  if (type === "parent" && data[1] === "*") return console.warn(location.origin, "sent", data[0], "with scope", data[1], "to parent");
  if (type=== "parent") return console.info(location.origin, "sent", data[0], "with scope", data[1], "to parent");
}

})();
