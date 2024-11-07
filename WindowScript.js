// Code here is exposed to the website.
(function() {
'use strict';

function whoami(w) {
  if (w === window.parent) return 'parent';
  if (w === window.opener) return 'opener';
  if (w === self) return 'self';
  return 'other';
}

function handle() {
  return {
    get: function(target, property) {
      let item = Reflect.get(...arguments);
      
      if (property === "postMessage") {
        return function() {
          result(arguments, whoami(target));
          Reflect.get(...arguments);
        }
      }
      
      if (property === "postLogger") {
        return true;
      }
      
      if (item.postLogger) {
        return Reflect.get(...arguments);
      }
      
      return new Proxy(item, handle);
    },
    set: function(target, property, value) {
      // Websites should not change this value.
      if (property === 'postLogger') return true;
      return Reflect.set(...arguments);
    }, 
  }
}

function hook(name) {  
  let item = window[name];
  // Try to modify the prototype
  try {
    let realProto = item.__proto__;
    window[name].__proto__ = new Proxy(realProto, handle);
  } catch {}
  window[name] = new Proxy(item, handle);
}
 
for (let name in window) {
  try {
    hook(name);
  } catch {}
}

function result(data, type) {
  if (type === "self") return console.info(location.origin, "sent", data[0], "with scope", data[1], "to self");
  if (type === "opener" && data[1] === "*") return console.warn(location.origin, "sent", data[0], "with scope", data[1], "to opener");
  if (type === "opener") return console.info(location.origin, "sent", data[0], "with scope", data[1], "to opener");
  if (type === "parent" && data[1] === "*") return console.warn(location.origin, "sent", data[0], "with scope", data[1], "to parent");
  if (type === "parent") return console.info(location.origin, "sent", data[0], "with scope", data[1], "to parent");
  if (type === "other" && data[1] === "*") return console.warn(location.origin, "sent", data[0], "with scope", data[1], "to other");
  if (type === "other") return console.info(location.origin, "sent", data[0], "with scope", data[1], "to other");
}

})();
