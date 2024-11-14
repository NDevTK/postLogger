// Code here is exposed to the website.
(function() {
    'use strict';

    const proxies = new WeakMap();
    const realOpen = window.open;
    
    const anarchyDomains = new Set(['https://firebasestorage.googleapis.com', 'https://www.gstatic.com', 'https://ssl.gstatic.com', 'https://googlechromelabs.github.io', 'https://storage.googleapis.com']);

    // Adds proxy to MessageEvent.source
    const desc = Object.getOwnPropertyDescriptor(window.MessageEvent.prototype, 'source');
    const get = desc.get;
    desc.get = function() {
        const source = get.call(this);
        return useProxy(source, handle('source'));
    };
    Object.defineProperty(window.MessageEvent.prototype, 'source', desc);

    // Detects when MessageEvent.origin is used. 
    const desc2 = Object.getOwnPropertyDescriptor(window.MessageEvent.prototype, 'origin');
    const getOrigin = desc2.get;
    desc2.get = function() {
        const origin = getOrigin();
        console.info(me, 'checked origin of message from', displayOrigin(origin));
        return origin;
    };
    Object.defineProperty(window.MessageEvent.prototype, 'origin', desc2);
    
    function useProxy(object, handler) {
        if (!object) return object;
        if (proxies.has(object)) {
            return proxies.get(object);
        }
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
    
    function whois(win, origin) {
        origin = displayOrigin(origin);
        if (win === window.top) return 'top (' + origin + ')';
        if (win === window.parent && win !== window) return 'parent (' + origin + ')';
        if (win === window.opener) return 'opener (' + origin + ')';

        if (win.opener === window && win === win.top) return 'popup (' + origin + ')';
        if (win.opener === window && win !== win.top) return 'popup iframe (' + origin + ')';

        if (window.opener?.opener === window) return 'opener of opener (' + origin + ')';
        if (window.opener?.parent === window && window.opener?.parent !== window.opener) return 'parent of opener (' + origin + ')';

        if (win.top === window.top && window.parent !== window.top) return 'nested iframe (' + origin + ')';
        if (win.top === window.top && window.parent === window.top) return 'iframe (' + origin + ')';
        return 'other (' + origin + ')';
    }

    const me = whois(window, window.origin);

    function hook(data, type, iframe) {
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
        if (type === "parent" && scope === "*") return console.warn(me, "sent", message, "with scope", scope, "to parent");
        if (type === "parent") return console.info(me, "sent", message, "with scope", scope, "to parent");
    }

    window.addEventListener("message", e => {
        console.info(me, "received", e.data, "from", whois(e.source, e.origin));
    });

    function hookIframe(iframe) {
        const iframeProxy = {
            get(target, prop, receiver) {
                let result = Reflect.get(...arguments);
                if (prop !== 'contentWindow') return result;
                return useProxy(result, handle('iframe', iframe));
            },
        };
        try {
            iframe.__proto__ = new Proxy(iframe.__proto__, iframeProxy);
        } catch {}
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
                if (property !== "postMessage") return Reflect.get(...arguments);
                return function() {
                    hook(arguments, type, iframe);
                    return target[property].apply(target, arguments);
                }
            },
        };
    }
    
    if (window.parent !== window) {
        window.parent = useProxy(window.parent, handle('parent'));
    }
    
    if (window.opener) {
        window.opener = useProxy(window.opener, handle('opener'));
    }
    
    window.postMessage = useProxy(window.postMessage, handle('self'));
    window.open = openHook;
})();
