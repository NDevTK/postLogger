# Security Audit

This document outlines the security audit performed on the browser extension.

## Audit Process

The audit involved:
1. Manual review of the `WindowScript.js` to identify potential JavaScript vulnerabilities.
2. Manual review of `manifest.json` and `manifest-firefox.json` for insecure configurations.

## Findings

### `WindowScript.js`
- **Data Exposure**: The script logs all `postMessage` data (`event.data`) to the browser's developer console. While this is a core feature for its debugging and monitoring purpose, it means any sensitive information passed via `postMessage` will be visible in these logs. Users and developers should be aware of this when using the extension on pages that might handle sensitive data.
- **`anarchyDomains`**: A predefined set of domains are labeled "UNSAFE". This is an awareness feature of the script.
- **Complexity**: The script uses extensive proxying and prototype manipulation. While handled with apparent care, complex interactions could arise in some environments.
- **Enhanced `postMessage` Interception (including `window.top`)**: The script now employs a global proxy on `Window.prototype.postMessage` to more reliably intercept `postMessage` calls from all window contexts, including `window.top`. It also specifically attempts to ensure `window.top.postMessage` uses this proxied version. A deduplication mechanism using a Symbol (`Symbol.for('postLoggerHandled')`) has been implemented to prevent logging the same message multiple times if it passes through different hooks.
- **No Direct XSS**: The script itself does not appear to introduce XSS vulnerabilities.

### Manifest Files (`manifest.json` and `manifest-firefox.json`)
- **Broad Host Permissions**: The extension uses `"matches": ["<all_urls>"]` for its content script. This grants `WindowScript.js` access to all web pages visited by the user. This is necessary for the extension's core functionality of logging `postMessage` calls universally.
- **`MAIN` World Execution**: The content script runs in the `"world": "MAIN"`, giving it direct access to the web page's DOM and JavaScript environment (though with an isolated JS global scope).
- **Minimal Other Permissions**: No other excessive permissions (like `storage`, `tabs` beyond what's needed for content script injection) are requested.
- **No Explicit CSP**: No `content_security_policy` is defined in the manifest, which is acceptable as the extension does not have its own HTML pages. Content scripts operate under default CSPs.
- **No `externally_connectable` or `web_accessible_resources`**: These are not defined, which is good security practice as it limits the attack surface from external pages or extensions.

## Security Considerations & Recommendations

1.  **Data Exposure via Console**:
    *   **Recommendation**: Users should be clearly informed that all `postMessage` data is logged to theconsole. If the extension is ever to be used in environments where highly sensitive data is common, consider adding a feature to selectively disable logging or mask sensitive patterns. However, for its current purpose as a developer tool, this logging is its primary function.
2.  **Broad Host Permissions (`<all_urls>`)**:
    *   **Recommendation**: This is inherent to the extension's purpose. The security of the extension relies heavily on the benign nature and robustness of `WindowScript.js`. Ensure any future changes to this script are carefully reviewed for potential security impacts.
3.  **Complexity of `WindowScript.js`**:
    *   **Recommendation**: Maintain thorough comments and documentation within `WindowScript.js` to manage its complexity. Rigorous testing is important if significant changes are made. The introduction of global prototype proxying and deduplication logic adds layers that require careful understanding during maintenance.
4.  **Cross-Origin `window.top` Interactions**:
    *   **Recommendation**: While the script aims to provide comprehensive logging, direct modification or deep inspection of a `window.top` that is cross-origin to the frame where the script is executing (or where the content script is injected) may be restricted by browser security policies. The script attempts to handle such scenarios gracefully (e.g., via `try-catch` when applying proxies or property definitions), but full interception or identification capability for cross-origin `window.top` might be limited by the browser's Same-Origin Policy. Users should be aware of these inherent browser limitations.

## Regular Updates

This `security.md` file should be reviewed and updated if:
- The extension's functionality changes significantly.
- New permissions are added to the manifest files.
- `WindowScript.js` undergoes major revisions.
- New, relevant web security vulnerabilities or best practices emerge that affect browser extensions or `postMessage` handling.

A yearly review is recommended as a baseline.
