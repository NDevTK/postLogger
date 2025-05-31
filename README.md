# postLogger
![Extension screenshot](preview.png)
![Extension screenshot](origincheck.png)
Extension to log postMessage()
- console.info for postMessages from all_frames.
- detects the scope of sent messages.
- origins that are insecure due to being a sandbox domain or a wildcard, will be prefixed with UNSAFE.
- detects if a website does not check MessageEvent.origin
- MessageChannel API

https://chrome.google.com/webstore/detail/aodfhblfhpcdadgcnpkfibjgjdoenoja
https://addons.mozilla.org/en-US/firefox/addon/postlogger/

## Security

This extension is designed to help developers and security researchers understand `postMessage` usage on web pages.
We take security seriously. A security audit of this extension has been performed, and the findings are documented in the [SECURITY.md](security.md) file.
Please review this document for details on the security aspects of this extension and recommendations. If you discover any security vulnerabilities, please report them responsibly.

# Warning
May cause unexpected behavour, if you find a security issue contact me.
