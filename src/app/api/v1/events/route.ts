import { validateSessionToken, readSessionToken } from "@/server/auth/session";
import { apiRoute } from "@/server/http/api-route";
import { changeFeed, type FeedMessage } from "@/server/realtime/change-feed";

/** Keeps idle connections open through proxies, and re-checks the session. */
const HEARTBEAT_MS = 25_000;

/**
 * Server-Sent Events stream of committed changes, for live-updating screens.
 * Any signed-in user may listen: events name only what changed (entity and
 * action), and the browser re-reads through its normal permission-checked
 * requests. The stream ends when the session does.
 */
export const GET = apiRoute({}, async ({ request }) => {
  const token = readSessionToken(request.headers.get("cookie"));
  const encoder = new TextEncoder();
  let stop = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const write = (chunk: string) => {
        if (!closed) controller.enqueue(encoder.encode(chunk));
      };
      const send = (message: FeedMessage | { type: "ready" }) =>
        write(`event: ${message.type}\ndata: ${JSON.stringify(message)}\n\n`);

      const unsubscribe = changeFeed.subscribe(send);
      const heartbeat = setInterval(async () => {
        if (!token || !(await validateSessionToken(token))) return stop();
        write(": heartbeat\n\n");
      }, HEARTBEAT_MS);

      stop = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // Already closed by the client.
        }
      };
      request.signal.addEventListener("abort", stop);

      // Reconnect after 5 s if the connection drops (e.g. during a deploy).
      write("retry: 5000\n\n");
      send({ type: "ready" });
    },
    cancel() {
      stop();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      // no-transform: compression would buffer the stream.
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
});
