import { createSession, SESSION_COOKIE_NAME } from "@/server/auth/session";

type RouteHandler = (
  request: Request,
  context: { params: Promise<Record<string, string | string[] | undefined>> },
) => Promise<Response>;

export interface CallOptions {
  method?: string;
  path?: string;
  body?: unknown;
  cookie?: string;
  params?: Record<string, string>;
  headers?: Record<string, string>;
}

export interface ApiResponse<T = unknown> {
  status: number;
  headers: Headers;
  json: { success: boolean; data?: T; error?: { code: string; message: string; details: unknown } };
}

/** Invokes a route handler the way Next.js would, without starting a server. */
export async function callRoute<T = unknown>(handler: RouteHandler, options: CallOptions = {}): Promise<ApiResponse<T>> {
  const method = options.method ?? (options.body === undefined ? "GET" : "POST");
  const headers = new Headers({ host: "localhost:3000", ...options.headers });
  if (options.cookie) headers.set("cookie", options.cookie);
  if (options.body !== undefined) headers.set("content-type", "application/json");

  const request = new Request(`http://localhost:3000${options.path ?? "/api/v1/test"}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const response = await handler(request, { params: Promise.resolve(options.params ?? {}) });
  return { status: response.status, headers: response.headers, json: await response.json() };
}

/** Opens a real session for the user and returns the Cookie header value. */
export async function sessionCookieFor(userId: string): Promise<string> {
  const { token } = await createSession(userId);
  return `${SESSION_COOKIE_NAME}=${token}`;
}
