// Code here is exposed to the website.
(function() {
    // Canonical Proxy Management System
    const originalToProxyMap = new WeakMap();
    const proxyToOriginalMap = new WeakMap();

    'use strict';

    // const proxies = new WeakMap(); // Replaced by originalToProxyMap & proxyToOriginalMap for canonical management
    const iframes = new WeakSet(); // Still used for tracking hooked iframes
    const uncheckedMessage = new Set();
    const uncheckedSource = new Set();
    const unusedMessages = new Set();
    const anarchyDomains = new Set(['https://firebasestorage.googleapis.com', 'https://www.gstatic.com', 'https://ssl.gstatic.com', 'https://googlechromelabs.github.io', 'https://storage.googleapis.com', 'https://www.google.com']); // Added google.com for testing example
    
    // Detects when MessageEvent.ports is used.
    const portsDescriptor = Object.getOwnPropertyDescriptor(window.MessageEvent.prototype, 'ports');
    const getPorts = portsDescriptor.get;
    portsDescriptor.get = function() {
        unusedMessages.delete(this);
        return getPorts.call(this);
    };
    Object.defineProperty(window.MessageEvent.prototype, 'ports', portsDescriptor);
    
    // Detects when MessageEvent.data is used.
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
    sourceDescriptor.get = function() { // This is the getter for event.source
        uncheckedSource.delete(this); // 'this' is the event object
        const rawSource = get.call(this); // Get the original source (a WindowProxy)
        // Ensure the rawSource is processed with the full 'handle' to get its canonical proxy
        // and set up trapping for its properties like .postMessage, .parent, .top, etc.
        return useProxy(rawSource, handle('event-source', rawSource), 'event.source');
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
    
    function useProxy(originalObject, handler, proxyType = 'unknown') {
      if (!originalObject || (typeof originalObject !== 'object' && typeof originalObject !== 'function')) {
        return originalObject; // Cannot proxy primitives, null, or undefined
      }

      if (originalToProxyMap.has(originalObject)) {
        return originalToProxyMap.get(originalObject);
      }

      if (proxyToOriginalMap.has(originalObject)) { // Input 'originalObject' is already a canonical proxy
        return originalObject;
      }
      
      // If handler is not provided or not an object, and originalObject is a Window instance,
      // use a default empty handler to ensure it gets a canonical proxy for identity comparisons.
      // For other object types, if no valid handler, return original to avoid errors (or proxy with {} if always needed).
      if (originalObject instanceof Window && (!handler || typeof handler !== 'object')) {
          handler = {}; // Default empty handler for windows to ensure they are in the map for === checks
          // console.log(`[WindowScript] useProxy: Using default empty handler for window type '${proxyType}'`);
      } else if (!handler || typeof handler !== 'object') {
        // For non-Window objects, a handler is expected if proxying is intended.
        // If no valid handler, and it's not a Window we want to track for identity, return original.
        // This line also catches if handler was truthy but not an object for non-windows.
        console.warn(`[WindowScript] useProxy: Handler was not an object or not provided for non-window type: '${proxyType}'. Original object returned. Handler:`, handler, 'Object:', originalObject);
        return originalObject;
      }

      let newProxy;
      try {
        newProxy = new Proxy(originalObject, handler);
      } catch (e) {
        console.warn(`[WindowScript] useProxy: Failed to create proxy for type '${proxyType}':`, e.message, "Object:", originalObject);
        return originalObject; // Return original on error
      }

      originalToProxyMap.set(originalObject, newProxy);
      proxyToOriginalMap.set(newProxy, originalObject);

      Object.defineProperty(newProxy, '__getOriginal', {
        value: () => originalObject,
        enumerable: false,
        writable: false, // Important: make it non-writable
        configurable: false // Make it non-configurable
      });
      
      // console.log(`[WindowScript] useProxy: Created new proxy for type '${proxyType}' for object:`, originalObject);
      return newProxy;
    }
    
    function displayOrigin(origin) {
        if (origin === 'null') return 'OPAQUE ' + origin;
        if (origin === '*') return 'UNSAFE ' + origin;
        if (origin === 'http://localhost' || origin.startsWith('http://localhost:') || origin === 'http://127.0.0.1' || origin.startsWith('http://127.0.0.1:')) return 'LOCAL ' + origin;
        if (origin.startsWith('http://')) return 'UNSAFE ' + origin;
        if (anarchyDomains.has(origin)) return 'UNSAFE ' + origin;
        return origin;
    }
    
    // whois now expects canonical proxies for source, current, parent, and top
    function whois(sourceProxy, origin, currentProxiedWin, parentProxiedWin, topProxiedWin) {
        const targetDisplay = displayOrigin(origin);

        // Direct comparisons with canonical proxies
        if (sourceProxy === topProxiedWin) return `top (${targetDisplay})`;
        if (sourceProxy === parentProxiedWin) return `parent (${targetDisplay})`;
        if (sourceProxy === currentProxiedWin) return `self (${targetDisplay})`;

        // For more complex relationships, access original properties and proxy them for comparison if they are windows
        const originalSource = sourceProxy.__getOriginal ? sourceProxy.__getOriginal() : sourceProxy;
        const originalCurrent = currentProxiedWin.__getOriginal ? currentProxiedWin.__getOriginal() : currentProxiedWin;

        if (originalSource && typeof originalSource === 'object') { // Ensure originalSource is an object before accessing properties
            try { // Accessing opener/top might be restricted
                const openerOriginal = originalSource.opener;
                if (openerOriginal === originalCurrent) return `popup (${targetDisplay})`;

                const sourceTopOriginal = originalSource.top;
                const sourceTopProxied = useProxy(sourceTopOriginal, handle('whois-sourcetop', sourceTopOriginal), 'whois-sourcetop');

                if (sourceTopProxied === topProxiedWin) { // Source is in the same top-level frame tree
                    // Now compare originalSource with original versions of iframes, or their proxies
                    // This part reconstructs logic from old whois:
                    // if (source.top.opener === window && source.window !== source.top.window) return 'popup iframe (' + target + ')';
                    //   originalSource.top.opener === originalCurrent && originalSource !== originalSource.top
                    const topOpenerOriginal = sourceTopOriginal ? sourceTopOriginal.opener : null;
                    if (topOpenerOriginal === originalCurrent && sourceProxy !== sourceTopProxied) return `popup iframe (${targetDisplay})`;
                    
                    // if (source.top === window.top && window.parent?.window !== window.top) return 'nested iframe (' + target + ')';
                    //   (already know sourceTopProxied === topProxiedWin)
                    //   currentProxiedWin.parent !== topProxiedWin (implies current is iframe, and not direct child of top)
                    //   This is about the *current script's context* being a nested iframe.
                    //   The original check was: source.top === window.top && window.parent?.window !== window.top
                    //   This should be: sourceTopProxied === topProxiedWin && parentProxiedWin !== topProxiedWin && currentProxiedWin !== parentProxiedWin
                    if (parentProxiedWin !== topProxiedWin && currentProxiedWin !== parentProxiedWin) return `nested iframe (${targetDisplay})`;
                    
                    // if (source.top === window.top && window.parent?.window === window.top) return 'iframe (' + target + ')';
                    //   (already know sourceTopProxied === topProxiedWin)
                    //   currentProxiedWin.parent === topProxiedWin (implies current is direct child iframe of top)
                    if (parentProxiedWin === topProxiedWin && currentProxiedWin !== topProxiedWin) return `iframe (${targetDisplay})`;
                }
            } catch (e) {
                // console.warn(`[WindowScript] whois: Error accessing properties on originalSource: ${e.message}`);
                // Errors can happen with cross-origin objects, fall through to 'other'.
            }
        }
        return `other (${targetDisplay})`;
    }
    
    // Initial canonical proxies for the script's own context.
    // IMPORTANT: Use the full 'handle' function to ensure these bootstrap proxies
    // behave consistently with other canonical proxies (e.g., for property access like .parent, .top).
    const currentProxiedWindow = useProxy(window, handle('self', window), 'script-self');
    let currentProxiedParent = null; // Handle potential null parent (e.g. for top window or detached iframes)
    try {
        currentProxiedParent = useProxy(window.parent, handle('parent', window.parent), 'script-parent');
    } catch(e) { console.warn("[WindowScript] Error proxying initial window.parent:", e); }
    let currentProxiedTop = null; // Handle potential errors accessing top
    try {
        currentProxiedTop = useProxy(window.top, handle('top', window.top), 'script-top');
    } catch(e) { console.warn("[WindowScript] Error proxying initial window.top:", e); }


    function hook(data, type, refOriginalObject) { // ref is now original object
        console.trace();
        
        // 'me' is the context of the script's execution, using its canonical proxy.
        // The origin for 'me' should be from the original window object.
        const meOrigin = currentProxiedWindow.__getOriginal ? currentProxiedWindow.__getOriginal().origin : window.origin;
        const me = whois(currentProxiedWindow, meOrigin, currentProxiedWindow, currentProxiedParent, currentProxiedTop);
        let scope = data[1];
        let message = data[0];
        let from = 'self';
        
        if (typeof scope === 'object') scope = scope.targetOrigin;
        // If omitted, then defaults to the origin that is calling the method.
        if (typeof scope !== 'string') scope = window.origin;
        scope = displayOrigin(scope);

        if (type === "MessageChannel" && ports.has(ref)) {
            from = ports.get(ref);
        }
        
        if (type === "self") return console.info(me, "sent", message, "with scope", scope, "to self");
        if (type === "opener" && scope === "*") return console.warn(me, "sent", message, "with scope", scope, "to opener");
        if (type === "opener") return console.info(me, "sent", message, "with scope", scope, "to opener");        
        if (type === "popup" && scope === "*") return console.warn(me, "sent", message, "with scope", scope, "to popup");
        if (type === "popup") return console.info(me, "sent", message, "with scope", scope, "to popup");      
        if (type === "iframe" && scope === "*") return console.warn(me, "sent", message, "with scope", scope, "to iframe", ref);
        if (type === "iframe") return console.info(me, "sent", message, "with scope", scope, "to iframe", ref);
        if (type === "source" && scope === "*") return console.warn(me, "sent", message, "with scope", scope, "to message source");
        if (type === "source") return console.info(me, "sent", message, "with scope", scope, "to message source");
        if (type === "MessageChannel") return console.info(me, "sent", message, "to MessageChannel from ", from, ref);
        if (type === "parent" && scope === "*") return console.warn(me, "sent", message, "with scope", scope, "to parent");
        if (type === "parent") return console.info(me, "sent", message, "with scope", scope, "to parent");
        return console.info(me, "sent", message, "with scope", scope, "to other");
    }
    
    const ports = new WeakMap();
    
    window.addEventListener("message", e => {
        const me = whois(window, window.origin);
        // 'source' is the context of the message sender.
        // e.source should be processed through useProxy before calling whois.
        const sourceProxied = useProxy(e.source, handle('event-source', e.source), 'event.source-listener'); // handle needs to be careful with non-window sources
        const sourceDisplay = whois(sourceProxied, e.origin, currentProxiedWindow, currentProxiedParent, currentProxiedTop);
        uncheckedMessage.add(e); // Still use raw event 'e' for tracking
        uncheckedSource.add(e);
        const port = e.ports[0];
        if (port && !ports.has(port)) {
            ports.set(port, source);
            port.addEventListener("message", (e) => {
                console.info(me, "received", e.data, "from", source, "via MessageChannel");
            });
        }
        unusedMessages.add(e);
        setTimeout(() => {
            const prefix = (unusedMessages.has(e)) ? 'unused' : 'used';

            if (!uncheckedMessage.has(e)) {
                console.info(me, prefix + " received", e.data, "from", source);
                return
            }
            
            if (uncheckedSource.has(e)) {
                console.warn(me, prefix + " did not verify or lookup source", e.data, "from", source);
                uncheckedSource.delete(e);
            } else {
                console.warn(me, prefix + " did not verify", e.data, "from", source);
            }
            uncheckedMessage.delete(e);
            unusedMessages.delete(e);
        }, 1000);
    });

  function hookIframe(iframe) {
      if (iframes.has(iframe)) return;
      iframes.add(iframe);
      const iframeProxy = {
          get(target, prop, receiver) {
              let result = Reflect.get(...arguments); // These are arguments of the 'get' trap
              if (prop !== 'contentWindow') return result;
              return useProxy(result, handle('iframe', iframe), 'iframe.contentWindow');
          },
      };
      try {
          iframe.__proto__ = useProxy(iframe.__proto__, iframeProxy, 'iframe.__proto__');
      } catch {}
  }

  function hookFunction(object, type, shouldProxy) {
      const functionProxy = {
          apply: function (target, thisArg, argumentsList) {
              // The 'postMessage' check and 'hook' call here are for the *original* function's behavior,
              // if it happens to be named 'postMessage'. This is not for intercepting calls on the proxy itself.
              // Interception of 'postMessage' on proxied window objects is handled by the 'handle' function.
              // Interception of 'postMessage' on MessagePort instances is handled by direct wrapping.
              // Interception of 'postMessage' on general Window instances is now via instance proxying.
              if (target.name === 'postMessage') {
                  // This specific hook is for functions that are themselves named postMessage.
                  // 'thisArg' here is the original object on which the function was called.
                  hook(argumentsList, type + '.directCall', thisArg); 
              }
              const result = Reflect.apply(target, thisArg, argumentsList);
              // 'type' here is for the *returned object* if it's a window (e.g. 'popup')
              // 'handle(type)' will create a handler for this new window.
              // 'result' is the newly opened window object.
              return (shouldProxy) ? useProxy(result, handle(type, result), type) : result; 
          },
      };
      // 'type' here is for the *function itself* (e.g. 'popup.function' for window.open)
      // 'object' is the window.open function.
      return useProxy(object, functionProxy, type + '.function'); 
  }
    
    // Initial proxying of existing iframes
    document.querySelectorAll('iframe').forEach(iframe => {
        hookIframe(iframe); // hookIframe internally calls useProxy on contentWindow
    });

    function iframeFinder(doc) {
        new MutationObserver(async records => {
            for (let record of records) {
                for (let node of record.addedNodes) {
                    if (node.tagName === 'IFRAME') {
                        hookIframe(node);
                    }
                }
            }
        }).observe(doc, {childList: true, subtree: true});
    }
    
    iframeFinder(document.documentElement);
    
    const attachShadow = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function(options) {
        const shadowRoot = attachShadow.call(this, options);
        iframeFinder(shadowRoot);
        return shadowRoot;
    };

    // handle(type, originalContextIfKnown) - originalContextIfKnown is primarily for clarity in debugging or specific cases.
    // The true original object is retrieved via proxyToOriginalMap.get(receiver) inside the traps.
    function handle(type, originalContextIfKnown = null) { 
        return {
            get: function(target, prop, receiver) { // target is original object initially passed to new Proxy(), receiver is the proxy.
                // Ensure we are operating on the true original object.
                const originalTarget = proxyToOriginalMap.get(receiver) || target;

                if (prop === 'postMessage') {
                    // Ensure we're getting postMessage from the true original object
                    const originalPostMessage = originalTarget.postMessage;
                    if (typeof originalPostMessage === 'function') {
                        return function(...args) { // This is the replacement function for '.postMessage'
                            // 'this' inside this function will be the proxy object (receiver).
                            hook(args, type, originalTarget); // Log the call; ref is originalTarget
                            return originalPostMessage.apply(originalTarget, args); // Call original postMessage on original object
                        };
                    }
                    // If originalTarget.postMessage is not a function (e.g. on a non-window object), fall through.
                }

                // Proxy common window properties to ensure interactions use canonical proxies.
                if (originalTarget instanceof Window) {
                    try {
                        if (prop === 'top' || prop === 'self' || prop === 'window') { // Added 'self' and 'window'
                            // For these self-referential properties, originalTarget[prop] is originalTarget itself.
                            // Pass it through useProxy to ensure the canonical proxy is returned.
                            // The 'type' for handle should reflect the property being accessed.
                            return useProxy(originalTarget[prop], handle(prop, originalTarget[prop]), `window-property-${prop}`);
                        }
                        if (prop === 'parent') {
                            return useProxy(originalTarget.parent, handle('parent', originalTarget.parent), 'window-property-parent');
                        }
                        if (prop === 'opener') {
                            return useProxy(originalTarget.opener, handle('opener', originalTarget.opener), 'window-property-opener');
                        }
                        if (prop === 'frames') {
                            // Accessing .frames can be problematic and might require a more complex proxy
                            // to handle the HTMLCollection and its item/namedItem methods.
                            // For now, returning the original or a simple proxy of it.
                            // This is a known area for potential deeper implementation if needed.
                            console.warn(`[WindowScript] Access to 'frames' collection on type '${type}' returns original. Full proxying not implemented. Object:`, originalTarget);
                            return originalTarget.frames; // Or useProxy(originalTarget.frames, {}, 'frames-collection') if it needs to be in map
                        }
                    } catch (e) {
                        console.warn(`[WindowScript] Error accessing property '${prop}' on type '${type}' via handle.get: ${e.message}. Object:`, originalTarget);
                        // Fall through to Reflect.get to return whatever the browser allows (e.g. null for cross-origin).
                    }
                }
                
                // Special handling for iframe.contentWindow (where originalTarget is the iframe DOM element)
                // This case is primarily handled by hookIframe which calls useProxy on the result of .contentWindow.
                // However, if an iframe DOM element itself were proxied with this generic handle, this would apply.
                if (prop === 'contentWindow' && originalTarget && originalTarget.tagName === 'IFRAME') {
                     return useProxy(originalTarget.contentWindow, handle('iframe.contentWindow', originalTarget.contentWindow), 'iframe.contentWindow-from-element-handle');
                }

                const value = Reflect.get(target, prop, receiver);
                
                if (typeof value === 'function') {
                    return value.bind(originalTarget);
                }
                
                return value;
            },
            set: function(target, prop, value, receiver) {
                const originalTarget = proxyToOriginalMap.get(receiver) || target;
                try {
                    return Reflect.set(originalTarget, prop, value);
                } catch (e) {
                    console.warn(`[WindowScript] Error setting property '${prop}' on type '${type}' via handle.set: ${e.message}. Object:`, originalTarget);
                    return false; 
                }
            },
        };
    }
    
    // Explicit proxying of window.parent, window.top, window.opener at the end of the script
    // is no longer needed. These properties will be trapped by the 'handle' function's get trap
    // when accessed on a proxied window (e.g., currentProxiedWindow.parent).

    const originalMessagePortPostMessage = MessagePort.prototype.postMessage;
    MessagePort.prototype.postMessage = function(...args) { // Use rest parameters
        hook(args, 'MessageChannel', this); // 'this' is the original MessagePort instance
        return originalMessagePortPostMessage.apply(this, args);
    };

    window.open = hookFunction(window.open, 'popup', true);
    // Initial window.opener (if it exists) for the current window context is handled by
    // currentProxiedWindow.opener via the 'handle' get trap.

    // The global Window.prototype.postMessage proxy and its enforcement on window.top have been removed.
    // PostMessage interception now relies on proxying individual window instances via useProxy/handle
    // and the direct wrapping of MessagePort.prototype.postMessage.
})();
