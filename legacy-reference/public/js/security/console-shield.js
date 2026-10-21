/**
 * Console Shield — Production Security
 * Suppresses all console output to prevent information leakage.
 * Load this as the VERY FIRST script on every page.
 *
 * NOTE: Automatically disabled when opened via file:// (local testing).
 *       All protections are active only on deployed (https://) environments.
 */
(function () {
    'use strict';

    // ── Auto-disable for local file:// testing ──
    if (window.location.protocol === 'file:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return; // Exit silently — no restrictions in local dev
    }

    // Disable all console methods
    const noop = function () { };
    const methods = [
        'log', 'debug', 'info', 'warn', 'error',
        'dir', 'dirxml', 'group', 'groupEnd', 'groupCollapsed',
        'trace', 'time', 'timeEnd', 'timeLog', 'timeStamp',
        'profile', 'profileEnd', 'count', 'countReset',
        'assert', 'clear', 'table'
    ];

    methods.forEach(function (method) {
        console[method] = noop;
    });

    // Block DevTools opening via keyboard shortcuts
    document.addEventListener('keydown', function (e) {
        // F12
        if (e.key === 'F12') {
            e.preventDefault();
            return false;
        }
        // Ctrl+Shift+I / Cmd+Option+I
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'I') {
            e.preventDefault();
            return false;
        }
        // Ctrl+Shift+J / Cmd+Option+J
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'J') {
            e.preventDefault();
            return false;
        }
        // Ctrl+U (view source)
        if ((e.ctrlKey || e.metaKey) && e.key === 'u') {
            e.preventDefault();
            return false;
        }
        // Ctrl+Shift+C (inspect element)
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C') {
            e.preventDefault();
            return false;
        }
    });

    // Block right-click context menu
    document.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        return false;
    });

    // DevTools size detection — redirect if tools open
    let devtoolsOpen = false;
    const threshold = 160;

    function checkDevTools() {
        const widthDiff = window.outerWidth - window.innerWidth > threshold;
        const heightDiff = window.outerHeight - window.innerHeight > threshold;

        if ((widthDiff || heightDiff) && !devtoolsOpen) {
            devtoolsOpen = true;
            // Silently clear the page content
            document.documentElement.innerHTML = `
                <html><head><title>Access Restricted</title>
                <style>
                    body { display:flex; align-items:center; justify-content:center;
                           height:100vh; margin:0; background:#0f172a; color:#94a3b8;
                           font-family:sans-serif; flex-direction:column; gap:1rem; }
                    h1 { color:#ef4444; font-size:1.5rem; }
                    p { font-size:0.875rem; }
                </style></head>
                <body>
                    <h1>⛔ Access Restricted</h1>
                    <p>Developer tools are not permitted on this platform.</p>
                    <p>Please close developer tools and refresh the page.</p>
                    <p>If you are seeing this, it means you have violated the terms of service.</p>
                </body></html>
            `;
        }

        if (!(widthDiff || heightDiff) && devtoolsOpen) {
            devtoolsOpen = false;
        }
    }

    setInterval(checkDevTools, 1000);

})();
