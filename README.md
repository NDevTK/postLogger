# postLogger
![Extension icon](preview.png)
Extension to log postMessage()
- console.info for postMessages from all_frames.
- detects the scope of sent messages.
- origins that are insecure due to being a sandbox domain or a wildcard, will be prefixed with UNSAFE.
- Detects if a website does not check MessageEvent.origin


# Warning
May cause unexpected behavour, if you find a security issues contact me.
