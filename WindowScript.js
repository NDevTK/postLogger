// Code here is exposed to the website.
(function() {
    'use strict';

    const proxies = new WeakMap();
    const uncheckedMessage = new Set();
    const realOpen = window.open;
    
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
        // We cant proxy the current window.
        if (object === window) return window;
        if (proxies.has(object)) {
            return proxies.get(object);
        }
        if (!handler) return;
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
        const windowTop = useProxy(window.top);
        const target = displayOrigin(origin);
        if (source === window.top) return 'top (' + target + ')';
        if (source === window.parent && win !== window) return 'parent (' + target + ')';
        if (source === window.opener) return 'opener (' + target + ')';

        if (source.opener === window && source === source.top) return 'popup (' + target + ')';
        if (source.opener === window && source !== source.top) return 'popup iframe (' + target + ')';

        if (window.opener?.opener === window) return 'opener of opener (' + target + ')';
        if (window.opener?.parent === window && window.opener?.parent !== window.opener) return 'parent of opener (' + target + ')';

        if (source.top === window.top && window.parent !== windowTop) return 'nested iframe (' + target + ')';
        if (source.top === window.top && window.parent === windowTop) return 'iframe (' + target + ')';
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
        if (type === "source" && scope === "*") return console.warn(me, "sent", message, "with scope", scope, "to message source", iframe);
        if (type === "source") return console.info(me, "sent", message, "with scope", scope, "to message source", iframe);
        if (type === "parent" && scope === "*") return console.warn(me, "sent", message, "with scope", scope, "to parent");
        if (type === "parent") return console.info(me, "sent", message, "with scope", scope, "to parent");
        return console.info(me, "sent", message, "with scope", scope, "to other");
    }

    window.addEventListener("message", e => {
        console.info(me, "received", e.data, "from", whois(e.source, e.origin));
        uncheckedMessage.add(e);
        setTimeout(() => {
            if (!uncheckedMessage.has(e)) return;
            console.warn(me, "did not verify", e.data, "from", whois(e.source, e.origin));
            uncheckedMessage.delete(e);
        }, 2000);
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
                // property might not exist.
                try {
                if (property !== "postMessage") return useProxy(Reflect.get(...arguments));
                } catch {}
                return function() {
                    hook(arguments, type, iframe);
                    return target[property]([...arguments]);
                }
            },
        };
    }
    
    window.parent = useProxy(window.parent, handle('parent'));
    window.opener = useProxy(window.opener, handle('opener'));
    window.postMessage = useProxy(window.postMessage, handle('self'));
    window.open = openHook;
})();
