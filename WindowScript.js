// Code here is exposed to the website.
(function() {
    'use strict';

    const proxies = new WeakMap();
    const iframes = new WeakSet();
    const uncheckedMessage = new Set();
    const uncheckedSource = new Set();
    const unusedMessages = new Set();
    const anarchyDomains = new Set(['https://firebasestorage.googleapis.com', 'https://www.gstatic.com', 'https://ssl.gstatic.com', 'https://googlechromelabs.github.io', 'https://storage.googleapis.com']);
   
    // Adds proxy to MessageEvent.data
    const dataDescriptor = Object.getOwnPropertyDescriptor(window.MessageEvent.prototype, 'data');
    const getData = dataDescriptor.get;
    dataDescriptor.get = function() {
        unusedMessages.delete(this);
        return getData.call(this);
    };
    Object.defineProperty(window.MessageEvent.prototype, 'data', dataDescriptor);
    
    // Adds proxy to MessageEvent.source
    const sourceDescriptor = Object.getOwnPropertyDescriptor(window.MessageEvent.prototype, 'source');
    const get = sourceDescriptor.get;
    sourceDescriptor.get = function() {
        uncheckedSource.delete(this);
        const source = get.call(this);
        return useProxy(source, handle('source'));
    };
    Object.defineProperty(window.MessageEvent.prototype, 'source', sourceDescriptor);

    // Detects when MessageEvent.origin is used.
    const originDescriptor = Object.getOwnPropertyDescriptor(window.MessageEvent.prototype, 'origin');
    const getOrigin = originDescriptor.get;
    originDescriptor.get = function() {
        const origin = getOrigin.apply(this);
        uncheckedMessage.delete(this);
        return origin;
    };
    Object.defineProperty(window.MessageEvent.prototype, 'origin', originDescriptor);
    
    function useProxy(object, handler) {
        if (!object) return object;
        if (window === object) return object;
        if (proxies.has(object)) {
            return proxies.get(object);
        }
        if (!handler) return object;
        const p = new Proxy(object, handler);
        proxies.set(object, p);
        return p;
    }
    
    function displayOrigin(origin) {
        if (origin === 'null') return 'OPAQUE ' + origin;
        if (origin === '*') return 'UNSAFE ' + origin;
        if (origin.startsWith('http://')) return 'UNSAFE ' + origin;
        if (anarchyDomains.has(origin)) return 'UNSAFE ' + origin;
        return origin;
    }
    
    function whois(source, origin) {
        const target = displayOrigin(origin);
        // .window is used to get the non-proxied version.
        if (source.window === window.top) return 'top (' + target + ')';
        if (source === window.parent) return 'parent (' + target + ')';
        if (source === window.opener) return 'opener (' + target + ')';
        if (source.opener === window) return 'popup (' + target + ')';
        if (source.top.opener === window && source.window !== source.top.window) return 'popup iframe (' + target + ')';
        if (source.top === window.top && window.parent?.window !== window.top) return 'nested iframe (' + target + ')';
        if (source.top === window.top && window.parent?.window === window.top) return 'iframe (' + target + ')';
        return 'other (' + target + ')';
    }
    
    function hook(data, type, ref) {
        const me = whois(window, window.origin);
        let scope = data[1];
        let message = data[0];
        if (typeof scope === 'object') scope = scope.targetOrigin;
        // If omitted, then defaults to the origin that is calling the method.
        if (typeof scope !== 'string') scope = window.origin;
        scope = displayOrigin(scope);
        if (type === "self") return console.info(me, "sent", message, "with scope", scope, "to self");
        if (type === "opener" && scope === "*") return console.warn(me, "sent", message, "with scope", scope, "to opener");
        if (type === "opener") return console.info(me, "sent", message, "with scope", scope, "to opener");        
        if (type === "popup" && scope === "*") return console.warn(me, "sent", message, "with scope", scope, "to popup");
        if (type === "popup") return console.info(me, "sent", message, "with scope", scope, "to popup");      
        if (type === "iframe" && scope === "*") return console.warn(me, "sent", message, "with scope", scope, "to iframe", ref);
        if (type === "iframe") return console.info(me, "sent", message, "with scope", scope, "to iframe", ref);
        if (type === "source" && scope === "*") return console.warn(me, "sent", message, "with scope", scope, "to message source");
        if (type === "source") return console.info(me, "sent", message, "with scope", scope, "to message source");
        if (type === "MessageChannel") return console.info(me, "sent", message, "to MessageChannel", ref);
        if (type === "parent" && scope === "*") return console.warn(me, "sent", message, "with scope", scope, "to parent");
        if (type === "parent") return console.info(me, "sent", message, "with scope", scope, "to parent");
        return console.info(me, "sent", message, "with scope", scope, "to other");
    }
    
    const ports = new WeakSet();
    
    window.addEventListener("message", e => {
        const me = whois(window, window.origin);
        const source = whois(e.source, e.origin);
        console.info(me, "received", e.data, "from", source);
        uncheckedMessage.add(e);
        uncheckedSource.add(e);
        unusedMessages.add(e);
        const port = e.ports[0];
        if (port && !ports.has(port)) {
            ports.add(port);
            port.addEventListener("message", (e) => {
                console.info(me, "received", e.data, "from", source, "via MessageChannel");
            });
        }
        setTimeout(() => {
            if (!uncheckedMessage.has(e)) return;
            const prefix = (unusedMessages.has(e)) ? 'unused' : 'used';
            if (uncheckedSource.has(e)) {
                console.warn(me, prefix + " did not verify or lookup source", e.data, "from", source);
                uncheckedSource.delete(e);
            } else {
                console.warn(me, prefix + " did not verify", e.data, "from", source);
            }
            uncheckedMessage.delete(e);
            unusedMessages.delete(e);
        }, 2000);
    });

  function hookIframe(iframe) {
      if (iframes.has(iframe)) return;
      iframes.add(iframe);
      const iframeProxy = {
          get(target, prop, receiver) {
              let result = Reflect.get(...arguments);
              if (prop !== 'contentWindow') return result;
              return useProxy(result, handle('iframe', iframe));
          },
      };
      try {
          iframe.__proto__ = useProxy(iframe.__proto__, iframeProxy);
      } catch {}
  }

  function hookFunction(object, type, shouldProxy) {
      const functionProxy = {
          apply: function (target, thisArg, argumentsList) {
              if (target.name === 'postMessage') {
                  hook(argumentsList, type, thisArg);
              }
              const result = Reflect.apply(...arguments);
              return (shouldProxy) ? useProxy(result, handle(type)) : result;
          },
      };
      return useProxy(object, functionProxy);
  }
    
    setInterval(() => {
        document.querySelectorAll('iframe').forEach(hookIframe);
    }, 100);
    
    function handle(type, iframe) {
        return {
            get: function(target, property) {
                if (property === "postMessage") {
                    return function() {
                        hook(arguments, type, iframe);
                        return target[property].apply(target, arguments);
                    }
                }
                try {
                    return Reflect.get(...arguments);
                } catch {
                    return target[property];
                }
            },
        };
    }
    
    if (window !== window.parent) {
        window.parent = useProxy(window.parent, handle('parent'));
    }
    MessagePort.prototype.postMessage = hookFunction(MessagePort.prototype.postMessage, 'MessageChannel');
    window.opener = useProxy(window.opener, handle('opener'));
    window.open = hookFunction(window.open, 'popup', true);
})();
