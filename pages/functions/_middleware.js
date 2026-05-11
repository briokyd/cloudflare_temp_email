const API_PATHS = [
    "/api/",
    "/open_api/",
    "/user_api/",
    "/admin/",
    "/telegram/",
    "/external/",
];

export async function onRequest(context) {
    const reqPath = new URL(context.request.url).pathname;
    if (API_PATHS.map(path => reqPath.startsWith(path)).some(Boolean)) {
        const backend = context.env.EMAIL_SERVICE || context.env.BACKEND;
        if (!backend || typeof backend.fetch !== "function") {
            return new Response("Backend service binding is not configured", { status: 500 });
        }
        return backend.fetch(context.request);
    }
    return await context.next();
}
