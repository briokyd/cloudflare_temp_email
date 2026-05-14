const API_PATHS = [
    "/api/",
    "/open_api/",
    "/user_api/",
    "/admin/",
    "/telegram/",
    "/external/",
];

const PUBLIC_ASSET_PATHS = [
    "/assets/",
    "/logo.png",
    "/favicon.ico",
    "/manifest.webmanifest",
    "/registerSW.js",
    "/sw.js",
    "/workbox-",
];

const ACCESS_COOKIE_NAME = "temp_mail_access";

function timingSafeEqual(a, b) {
    const left = new TextEncoder().encode(String(a || ""));
    const right = new TextEncoder().encode(String(b || ""));
    if (left.length !== right.length) return false;
    let out = 0;
    for (let i = 0; i < left.length; i += 1) out |= left[i] ^ right[i];
    return out === 0;
}

function parseCookies(header) {
    return Object.fromEntries(
        String(header || "")
            .split(";")
            .map((part) => part.trim())
            .filter(Boolean)
            .map((part) => {
                const idx = part.indexOf("=");
                if (idx === -1) return [part, ""];
                return [part.slice(0, idx), decodeURIComponent(part.slice(idx + 1))];
            }),
    );
}

function shouldBypassAccessGate(pathname) {
    return PUBLIC_ASSET_PATHS.some((path) => pathname.startsWith(path));
}

async function withAccessGate(context, next) {
    const accessKey = context.env.TEMP_MAIL_ACCESS_KEY;
    if (!accessKey) return next();

    const url = new URL(context.request.url);
    if (shouldBypassAccessGate(url.pathname)) return next();

    const suppliedKey = url.searchParams.get("access_key") || url.searchParams.get("key");
    const cookies = parseCookies(context.request.headers.get("Cookie"));
    const hasCookie = timingSafeEqual(cookies[ACCESS_COOKIE_NAME], accessKey);
    const hasQueryKey = timingSafeEqual(suppliedKey, accessKey);

    if (!hasCookie && !hasQueryKey) {
        return new Response(
            "This temp-mail instance is private. Open it with a valid access link.",
            {
                status: 401,
                headers: {
                    "Content-Type": "text/plain; charset=utf-8",
                    "Cache-Control": "no-store",
                },
            },
        );
    }

    if (!hasQueryKey) return next();

    url.searchParams.delete("access_key");
    url.searchParams.delete("key");

    const cookie = `${ACCESS_COOKIE_NAME}=${encodeURIComponent(accessKey)}; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax`;
    if (url.toString() !== context.request.url) {
        return new Response(null, {
            status: 302,
            headers: {
                Location: url.toString(),
                "Set-Cookie": cookie,
                "Cache-Control": "no-store",
            },
        });
    }

    const upstream = await next();
    const response = new Response(upstream.body, upstream);
    response.headers.append("Set-Cookie", cookie);
    response.headers.set("Cache-Control", "no-store");
    return response;
}

export async function onRequest(context) {
    return withAccessGate(context, async () => {
        const reqPath = new URL(context.request.url).pathname;
        if (API_PATHS.map(path => reqPath.startsWith(path)).some(Boolean)) {
            const backend = context.env.EMAIL_SERVICE || context.env.BACKEND;
            if (!backend || typeof backend.fetch !== "function") {
                return new Response("Backend service binding is not configured", { status: 500 });
            }
            return backend.fetch(context.request);
        }
        return await context.next();
    });
}
