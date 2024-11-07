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
      let result = Reflect.get(...arguments);
      
      if (property === "postMessage") {
        return result(arguments, whoami(target));
      }
      
      if (property === "postLogger") {
        return true;
      }
      
      if (result.postLogger) return result;
      return new Proxy(result, handle);
    },
    set: function(target, property, value) {
      // Websites should not change this value.
      if (property === 'postLogger') return true;
      return Reflect.set(...arguments);
    }, 
  }
}

function hook(item) {
  // Try to modify the prototype
  try {
    let realProto = item.__proto__;
    item.__proto__ = new Proxy(realProto, handle);
  } catch {}
  // Try to modify the item directly
  try {
    let real = item;
    item = new Proxy(real, handle);
  } catch {}
}

hook(window.postMessage);
hook(window.parent?.postMessage);
hook(window.opener?.postMessage);
hook(window.document);

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
