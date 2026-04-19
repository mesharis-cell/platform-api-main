/**
 * Typed HTTP client for tests + actor helpers.
 *
 * Uses native fetch against the real Express app bound to a localhost port
 * (see test/setup/lifecycle.ts). Does not auto-throw on non-2xx — negative
 * tests (expect 403, expect 422) need the response shape to be first-class.
 *
 * The API's platformValidator middleware reads `x-platform` as a UUID, so
 * PlatformContext carries `platformId` (not a domain). Resolve the UUID
 * by querying the seeded `platforms` row before constructing the client.
 */

export type HttpResponse<T = unknown> = {
    status: number;
    headers: Headers;
    body: T;
    ok: boolean;
};

export type HttpClient = {
    get<T = unknown>(path: string, opts?: RequestInit): Promise<HttpResponse<T>>;
    post<T = unknown>(path: string, body?: unknown, opts?: RequestInit): Promise<HttpResponse<T>>;
    patch<T = unknown>(path: string, body?: unknown, opts?: RequestInit): Promise<HttpResponse<T>>;
    put<T = unknown>(path: string, body?: unknown, opts?: RequestInit): Promise<HttpResponse<T>>;
    delete<T = unknown>(path: string, opts?: RequestInit): Promise<HttpResponse<T>>;
    withAuth(token: string): HttpClient;
    withHeaders(headers: Record<string, string>): HttpClient;
};

const parseBody = async (res: Response): Promise<unknown> => {
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) return res.json().catch(() => null);
    if (ct.startsWith("text/")) return res.text().catch(() => null);
    return null;
};

const build = (baseUrl: string, defaultHeaders: Record<string, string>): HttpClient => {
    const request = async <T>(
        method: string,
        pathOrUrl: string,
        body?: unknown,
        opts?: RequestInit
    ): Promise<HttpResponse<T>> => {
        const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${baseUrl}${pathOrUrl}`;
        const headers = {
            "content-type": "application/json",
            ...defaultHeaders,
            ...((opts?.headers as Record<string, string>) ?? {}),
        };
        const init: RequestInit = {
            ...opts,
            method,
            headers,
            body: body !== undefined ? JSON.stringify(body) : opts?.body,
        };
        const res = await fetch(url, init);
        const parsed = (await parseBody(res)) as T;
        return { status: res.status, headers: res.headers, body: parsed, ok: res.ok };
    };

    return {
        get: (p, o) => request("GET", p, undefined, o),
        post: (p, b, o) => request("POST", p, b, o),
        patch: (p, b, o) => request("PATCH", p, b, o),
        put: (p, b, o) => request("PUT", p, b, o),
        delete: (p, o) => request("DELETE", p, undefined, o),
        withAuth: (token: string) =>
            build(baseUrl, { ...defaultHeaders, authorization: `Bearer ${token}` }),
        withHeaders: (headers: Record<string, string>) =>
            build(baseUrl, { ...defaultHeaders, ...headers }),
    };
};

export type PlatformContext = {
    /** Platform UUID — the API's platformValidator middleware reads this as the x-platform header. */
    platformId: string;
};

export const createClient = (baseUrl: string, ctx: PlatformContext): HttpClient =>
    build(baseUrl, { "x-platform": ctx.platformId });

export type ActorCredentials = {
    email: string;
    password: string;
};

export type Actor = HttpClient & {
    email: string;
};

export type Actors = {
    admin: Actor;
    logistics: Actor;
    client: Actor;
    unauthenticated: HttpClient;
};

type LoginResponse = {
    success: boolean;
    data?: {
        access_token?: string;
        refresh_token?: string;
    };
    message?: string;
};

const loginAndBind = async (base: HttpClient, creds: ActorCredentials): Promise<Actor> => {
    const res = await base.post<LoginResponse>("/auth/login", creds);
    if (!res.ok) {
        throw new Error(
            `Actor login failed for ${creds.email}: status=${res.status} body=${JSON.stringify(res.body)}`
        );
    }
    const token = res.body?.data?.access_token;
    if (!token) {
        throw new Error(
            `Actor login returned 2xx but no access_token for ${creds.email}: ${JSON.stringify(res.body)}`
        );
    }
    const authed = base.withAuth(token) as Actor;
    authed.email = creds.email;
    return authed;
};

export const createActors = async (
    base: HttpClient,
    creds: { admin: ActorCredentials; logistics: ActorCredentials; client: ActorCredentials }
): Promise<Actors> => {
    const [admin, logistics, client] = await Promise.all([
        loginAndBind(base, creds.admin),
        loginAndBind(base, creds.logistics),
        loginAndBind(base, creds.client),
    ]);
    return { admin, logistics, client, unauthenticated: base };
};
