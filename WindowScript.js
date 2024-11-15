// Code here is exposed to the website.
(function() {
    'use strict';

    const proxies = new WeakMap();
    const iframes = new WeakSet();
    const uncheckedMessage = new Set();
    const realOpen = window.open;
    const realParent = window.parent;
    const realTop = window.top;
    const anarchyDomains = new Set(['https://firebasestorage.googleapis.com', 'https://www.gstatic.com', 'https://ssl.gstatic.com', 'https://googlechromelabs.github.io', 'https://storage.googleapis.com']);

    // Adds proxy to MessageEvent.source
    const sourceDescriptor = Object.getOwnPropertyDescriptor(window.MessageEvent.prototype, 'source');
    const get = sourceDescriptor.get;
    sourceDescriptor.get = function() {
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
        if (source.window === window.top) return 'top (' + target + ')';
        if (source === window.parent && source !== window) return 'parent (' + target + ')';
        if (source === window.opener) return 'opener (' + target + ')';

        if (source.opener === window && source.window === source.top.window) return 'popup (' + target + ')';
        if (source.opener === window && source.window !== source.top.window) return 'popup iframe (' + target + ')';

        if (window.opener?.opener === window) return 'opener of opener (' + target + ')';
        if (window.opener?.parent === window && window.opener?.parent !== window.opener) return 'parent of opener (' + target + ')';
        // We cant hook window.top so it always provides the non-proxied value.
        if (source.parent === source && realParent !== realTop) return 'nested iframe (' + target + ')';
        if (source.parent !== source && realParent === realTop) return 'iframe (' + target + ')';
        return 'other (' + target + ')';
    }

    
    function hook(data, type, iframe) {
        const me = whois(window, window.origin);
        let scope = data[1];
        let message = data[0];
        // If omitted, then defaults to the origin that is calling the method.
        if (!scope) scope = window.origin;
        scope = displayOrigin(scope);
        if (type === "self") return console.info(me, "sent", message, "with scope", scope, "to self");
        if (type === "opener" && scope === "*") return console.warn(me, "sent", message, "with scope", scope, "to opener");
        if (type === "opener") return console.info(me, "sent", message, "with scope", scope, "to opener");        
        if (type === "popup" && scope === "*") return console.warn(me, "sent", message, "with scope", scope, "to popup");
        if (type === "popup") return console.info(me, "sent", message, "with scope", scope, "to popup");      
        if (type === "iframe" && scope === "*") return console.warn(me, "sent", message, "with scope", scope, "to iframe", iframe);
        if (type === "iframe") return console.info(me, "sent", message, "with scope", scope, "to iframe", iframe);
        if (type === "source" && scope === "*") return console.warn(me, "sent", message, "with scope", scope, "to message source", iframe);
        if (type === "source") return console.info(me, "sent", message, "with scope", scope, "to message source", iframe);
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
        const port = e.ports[0];
        if (port && !ports.has(port)) {
            ports.add(port);
            port.addEventListener("message", (e) => {
                console.info(me, "received", e.data, "from", source, "via MessageChannel");
            });
        }
        setTimeout(() => {
            if (!uncheckedMessage.has(e)) return;
            console.warn(me, "did not verify", e.data, "from", source);
            uncheckedMessage.delete(e);
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

  function hookFunction(object, type, shouldProxy, iframe) {
      const functionProxy = {
          apply: function (target, thisArg, argumentsList) {
              if (target.name === 'postMessage') {
                  hook(argumentsList, type, iframe);
              }
              const result = Reflect.apply(...arguments);
              return (shouldProxy) ? useProxy(result, handle(type)) : result;
          },
      };
      return useProxy(object, functionProxy);
  }

    // Adds proxy when addEventListener is used on iframe.
    const addEvent = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function() {
        if (this instanceof HTMLIFrameElement) {
            hookIframe(this);
        }
        return addEvent.apply(this, arguments);
    }
    
    setInterval(() => {
        document.querySelectorAll('iframe').forEach(hookIframe);
    }, 100);

    function openHook(url) {
        const win = realOpen(url);
        if (!win) return win;
        return useProxy(win, handle('popup'));
    }
    
    function handle(type, iframe) {
        return {
            get: function(target, property) {
                if (property === "postMessage") {
                    return function() {
                        hook(arguments, type, iframe);
                        return target[property].apply(target, arguments);
                    }
                }
                let object = {};
                try {
                    object = Reflect.get(...arguments);
                } catch {
                    object = target[property];
                }
                return object;
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
