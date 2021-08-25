let realOpener = window.opener;
let realParent = window.parent;
let realPost = window.postMessage;

const handler = {
  get: function(target, property) {
    if (property !== "postMessage") return target[property];
    return function() {
      hook(arguments, target);
      target[property].apply(target, arguments);
    }
  },
};

if (realOpener) window.opener = new Proxy(realOpener, handler);
if (realParent) window.parent = new Proxy(realParent, handler);

window.postMessage = function() {
  hook(arguments, window);
  realPost.apply(this, arguments);
}


function hook(data, target) {
  if (target === window) return console.info(location.origin, "sent", data[0], "with scope", data[1], "to self");
  if (target === realOpener && data[1] === "*") return console.warn(location.origin, "sent", data[0], "with scope", data[1], "to opener");
  if (target === realOpener) return console.info(location.origin, "sent", data[0], "with scope", data[1], "to opener");
  if (target === realParent && data[1] === "*") return console.warn(location.origin, "sent", data[0], "with scope", data[1], "to parent");
  if (target === realParent) return console.info(location.origin, "sent", data[0], "with scope", data[1], "to parent");
}
