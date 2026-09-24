import { randomUUID } from "node:crypto";
import type { z } from "zod";
import { can, type Permission } from "@/lib/permissions";
import type { Actor } from "@/server/actor";
import { readSessionToken, validateSessionToken, type SessionUser } from "@/server/auth/session";
import { AuthenticationError, ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { jsonError, jsonSuccess, toAppError } from "./api-response";

type Schema = z.ZodType;
type Infer<S> = S extends Schema ? z.output<S> : undefined;

/** Next.js passes dynamic segments as a promise (Next 16). */
interface NextRouteContext {
  params: Promise<Record<string, string | string[] | undefined>>;
}

export interface RequestMeta {
  requestId: string;
  ipAddress: string | null;
  userAgent: string | null;
}

interface BaseContext<B extends Schema | undefined, Q extends Schema | undefined> {
  request: Request;
  body: Infer<B>;
  query: Infer<Q>;
  params: Record<string, string>;
  meta: RequestMeta;
}

export interface ApiContext<B extends Schema | undefined, Q extends Schema | undefined>
  extends BaseContext<B, Q> {
  user: SessionUser;
  actor: Actor;
}

interface RouteOptions<B extends Schema | undefined, Q extends Schema | undefined> {
  /** Required permission; omit for "any signed-in user". */
  permission?: Permission;
  body?: B;
  query?: Q;
  /** HTTP status for a successful response (default 200). */
  successStatus?: number;
}

type Handler<C> = (ctx: C) => Promise<unknown>;

/**
 * Wraps an authenticated /api/v1 route handler: request id, session,
 * permission check, same-origin check for mutations, zod validation, and the
 * standard success/error envelope. Handlers may return a Response to take
 * full control (e.g. to set cookies).
 */
export function apiRoute<B extends Schema | undefined = undefined, Q extends Schema | undefined = undefined>(
  options: RouteOptions<B, Q>,
  handler: Handler<ApiContext<B, Q>>,
) {
  return (request: Request, context: NextRouteContext) =>
    execute(request, context, options, async (base) => {
      const token = readSessionToken(request.headers.get("cookie"));
      const user = token ? await validateSessionToken(token) : null;
      if (!user) throw new AuthenticationError();
      if (options.permission && !can(user.role, options.permission)) throw new ForbiddenError();

      const actor: Actor = {
        userId: user.id,
        role: user.role,
        ipAddress: base.meta.ipAddress,
        userAgent: base.meta.userAgent,
        requestId: base.meta.requestId,
      };
      return handler({ ...base, user, actor });
    });
}

/** Same as apiRoute but without authentication (login only). */
export function publicApiRoute<B extends Schema | undefined = undefined, Q extends Schema | undefined = undefined>(
  options: Omit<RouteOptions<B, Q>, "permission">,
  handler: Handler<BaseContext<B, Q>>,
) {
  return (request: Request, context: NextRouteContext) => execute(request, context, options, handler);
}

async function execute<B extends Schema | undefined, Q extends Schema | undefined>(
  request: Request,
  context: NextRouteContext,
  options: RouteOptions<B, Q>,
  run: Handler<BaseContext<B, Q>>,
): Promise<Response> {
  const meta = getRequestMeta(request);
  const headers = { "x-request-id": meta.requestId };

  try {
    if (request.method !== "GET" && request.method !== "HEAD") assertSameOrigin(request);

    const base: BaseContext<B, Q> = {
      request,
      meta,
      params: normaliseParams(await context.params),
      body: (options.body ? options.body.parse(await readJsonBody(request)) : undefined) as Infer<B>,
      query: (options.query
        ? options.query.parse(Object.fromEntries(new URL(request.url).searchParams))
        : undefined) as Infer<Q>,
    };

    const result = await run(base);
    if (result instanceof Response) {
      result.headers.set("x-request-id", meta.requestId);
      return result;
    }
    return jsonSuccess(result ?? null, options.successStatus ?? 200, headers);
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      console.error(`[api] ${request.method} ${new URL(request.url).pathname} (${meta.requestId})`, error);
    }
    return jsonError(appError, headers);
  }
}

export function getRequestMeta(request: Request): RequestMeta {
  const forwardedFor = request.headers.get("x-forwarded-for");
  return {
    requestId: randomUUID(),
    ipAddress: forwardedFor?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || null,
    userAgent: request.headers.get("user-agent"),
  };
}

/** An empty body is treated as `{}` so the schema decides what is required. */
async function readJsonBody(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.trim() === "") return {};

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new ValidationError("Expected a JSON request body (Content-Type: application/json).");
  }
  return JSON.parse(text);
}

/**
 * CSRF defence in depth (the session cookie is also SameSite=Lax): browsers
 * always send Origin on cross-site mutations, so a mismatch is rejected.
 */
function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new ForbiddenError("Cross-origin request rejected.");
  }
  if (!host || originHost !== host) throw new ForbiddenError("Cross-origin request rejected.");
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Reads a UUID path segment; a malformed id can never match a record. */
export function uuidParam(params: Record<string, string>, name: string, entity: string): string {
  const value = params[name];
  if (!value || !UUID_PATTERN.test(value)) throw new NotFoundError(entity, value);
  return value.toLowerCase();
}

function normaliseParams(params: Record<string, string | string[] | undefined> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(params ?? {})) {
    if (typeof value === "string") out[key] = value;
    else if (Array.isArray(value)) out[key] = value.join("/");
  }
  return out;
}
