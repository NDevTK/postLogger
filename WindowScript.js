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
    
    function whois(win, origin) {
        const source = useProxy(win);
        const me = useProxy(window);
        const target = displayOrigin(origin);
        if (source === me.top) return 'top (' + target + ')';
        if (source === me.parent && source !== me) return 'parent (' + target + ')';
        if (source === me.opener) return 'opener (' + target + ')';

        if (source.opener === me && source === source.top) return 'popup (' + target + ')';
        if (source.opener === me && source !== source.top) return 'popup iframe (' + target + ')';

        if (me.opener?.opener === me) return 'opener of opener (' + target + ')';
        if (me.opener?.parent === me && me.opener?.parent !== me.opener) return 'parent of opener (' + target + ')';

        if (source.top === me.top && me.parent !== me.top) return 'nested iframe (' + target + ')';
        if (source.top === me.top && me.parent === me.top) return 'iframe (' + target + ')';
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

    window.addEventListener("message", e => {
        const me = whois(window, window.origin);
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
            iframe.__proto__ = useProxy(iframe.__proto__, iframeProxy);
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
                if (type === 'self' && property === 'top') {
                    return object;
                }
                return useProxy(object);
            },
        };
    }
    
    if (window !== window.parent) {
        window.parent = useProxy(window.parent, handle('parent'));
    }
    
    window.opener = useProxy(window.opener, handle('opener'));
    window.postMessage = useProxy(window.postMessage, handle('self'));
    // We cant proxy the current window or window.top but creating the proxies anyway.
    useProxy(window, handle('self'));
    useProxy(window.top, handle('self'));
    window.open = openHook;
})();
