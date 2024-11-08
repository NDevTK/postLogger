// Code here is exposed to the website.
(function() {
    'use strict';

    const iframes = new WeakSet();

    function whois(win, origin) {
        if (win === window.top) return 'top (' + origin + ')';
        if (win === window.parent && win !== window) return 'parent (' + origin + ')';
        if (win === window.opener) return 'opener (' + origin + ')';

        if (win.opener === window && win === win.top) return 'popup (' + origin + ')';
        if (win.opener === window && win !== win.top) return 'popup iframe (' + origin + ')';

        if (win.opener?.opener === window) return 'opener of opener (' + origin + ')';
        if (win.opener?.parent === window && win.opener?.parent !== win.opener) return 'parent of opener (' + origin + ')';

        if (win.top === window.top && win.parent !== window.top) return 'nested iframe (' + origin + ')';
        if (win.top === window.top && win.parent === window.top) return 'iframe (' + origin + ')';
        return 'other (' + origin + ')';
    }

    const me = whois(window, window.origin);

    function hook(data, type, iframe) {
        let scope = data[1];
        let message = data[0];
        // If omitted, then defaults to the origin that is calling the method.
        if (!scope) scope = window.origin;
        if (type === "self") return console.info(me, "sent", message, "with scope", scope, "to self");
        if (type === "opener" && scope === "*") return console.warn(me, "sent", message, "with scope", scope, "to opener");
        if (type === "opener") return console.info(me, "sent", message, "with scope", scope, "to opener");
        if (type === "iframe" && scope === "*") return console.warn(me, "sent", message, "with scope", scope, "to iframe", iframe);
        if (type === "iframe") return console.info(me, "sent", message, "with scope", scope, "to iframe", iframe);
        if (type === "parent" && scope === "*") return console.warn(me, "sent", message, "with scope", scope, "to parent");
        if (type === "parent") return console.info(me, "sent", message, "with scope", scope, "to parent");
    }

    window.addEventListener("message", e => {
        console.info(me, "received", e.data, "from", whois(e.source, e.origin));
    });

    function hookIframe(iframe) {
        // Keep track of iframe usage to avoid repetitive proxy creation.
        if (iframes.has(iframe)) return;
        const iframeProxy = {
            get(target, prop, receiver) {
                let result = Reflect.get(...arguments);
                if (prop !== 'contentWindow') return result;
                return new Proxy(result, handle('iframe', iframe));
            },
        };
        try {
            iframe.__proto__ = new Proxy(iframe.__proto__, iframeProxy);
            iframes.add(iframe);
        } catch {}
    }

    setInterval(() => {
        document.querySelectorAll('iframe').forEach(hookIframe);
    }, 100);

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
        window.parent.postMessage = new Proxy(window.parent.postMessage, handle('parent'));
    }
    
    if (window.opener) {
        window.opener.postMessage = new Proxy(window.opener.postMessage, handle('opener'));
    }
    
    window.postMessage = new Proxy(window.postMessage, handle('self'));
})();
