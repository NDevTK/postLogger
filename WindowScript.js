const windows = new Map();

const handler = {
  get: function(target, property) {
    if (property !== "postMessage") return target[property];
    return function() {
      hook(arguments, target);
      let result = target[property].apply(target, arguments);
      hookWindow(result.source);
      return result;
    }
  },
};

function hookWindow(w) {
  if (!w) return;
  
  if (w.opener) {
    let real = w.opener;
    if (windows.has(real)) {
      w.opener = windows.get(real);
    } else {
      w.opener = new Proxy(real, handler);
      windows.set(real, w);
    }
    real.postLoggerType = "opener";
  }
  
  if (w.parent) {
    let real = w.parent;
    if (windows.has(real)) {
      w.parent = windows.get(real);
    } else {
      w.parent = new Proxy(real, handler);
      windows.set(real, w);
    }
    real.postLoggerType = "parent";
  }
  
  if (w) {
    let real = w.postMessage;
    if (windows.has(real)) {
      w.postMessage = windows.get(real);
    } else {
      w.postMessage = function() {
        hook(arguments);
        real.apply(this, arguments);
      }
      windows.set(real, w);
    }
    real.postLoggerType = "self;
  }
}

hookWindow(window);

function hook(data, target) {
  if (target.postLoggerType === "self") return console.info(location.origin, "sent", data[0], "with scope", data[1], "to self");
  if (target.postLoggerType === "opener" && data[1] === "*") return console.warn(location.origin, "sent", data[0], "with scope", data[1], "to opener");
  if (target.postLoggerType === "opener") return console.info(location.origin, "sent", data[0], "with scope", data[1], "to opener");
  if (target.postLoggerType === "parent" && data[1] === "*") return console.warn(location.origin, "sent", data[0], "with scope", data[1], "to parent");
  if (target.postLoggerType === "parent") return console.info(location.origin, "sent", data[0], "with scope", data[1], "to parent");
}
