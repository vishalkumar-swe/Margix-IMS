/**
 * Liveness probe: the process is up and serving requests. Deliberately does
 * not touch the database, so a database outage does not restart the app.
 */
export function GET() {
  return Response.json({ status: "ok" }, { headers: { "cache-control": "no-store" } });
}
