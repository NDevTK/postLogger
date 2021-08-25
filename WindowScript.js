let realOpener = window.opener;
let realParent = window.parent;
let realPost = window.postMessage;

const handler = {
  get: function(target, property) {
    if (property !== "postMessage") return target[property];
    return function() {
      hook(arguments);
      target[property].apply(target, arguments);
    }
  },
};

window.opener = new Proxy(realOpener, handler);
window.parent = new Proxy(realParent, handler);

window.postMessage = function() {
  hook(arguments);
  realPost.apply(this, arguments);
}


function hook(data) {
  console.log(data);
}
