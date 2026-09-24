# Integrations

Everything Margix IMS exchanges with outside systems (Tally Prime, e-mail,
WhatsApp, webhooks) is built the same way, so each new one only has to fill
in the parts that are genuinely different. Administrators see and test them
all on **Administration → Integrations** (`/admin/integrations`).

- [How an integration is built](#how-an-integration-is-built)
- [Adding a new integration](#adding-a-new-integration)
- [Tally Prime](#tally-prime)
- [E-mail (SMTP)](#e-mail-smtp)
- [WhatsApp (Meta Cloud API)](#whatsapp-meta-cloud-api)
- [In-app notifications](#in-app-notifications)
- [Webhooks](#webhooks)
- [Troubleshooting](#troubleshooting)

## How an integration is built

```
business transaction ──► outbox row (same commit) ──► worker claims (SKIP LOCKED) ──► provider call ──► result recorded
      (GRN, dispatch…)     tally_sync_job /              scripts/tally-sync.ts           integrationFetch()     DELIVERED / FAILED
                           notification_outbox /         scripts/notify.ts               with a timeout         + backoff
                           webhook_delivery
```

Four rules, which keep integrations from ever corrupting or blocking stock:

1. **Transactional outbox.** Work for an outside system is written as a row
   *inside* the business transaction. If the transaction rolls back, nothing is
   sent. If the outside system is down, the business change still commits.
2. **Workers deliver, never the request.** Web requests never call an outside
   system (the only exceptions are the admin's "Check connection" and channel
   "Send test" buttons). Workers claim rows with `FOR UPDATE SKIP LOCKED` under
   a short lease. Several workers can run at once, and a crashed worker's rows
   are picked up again when the lease expires.
3. **One retry policy.** `src/server/integrations/retry.ts`: 2, 4, 8, 16, 32
   and then 60 minutes, for 6 attempts in total. A permanent failure (e.g.
   HTTP 400/401/404) is not retried. An administrator can retry any failed row
   from the admin screens.
4. **Credentials only in the environment.** They are validated in
   `src/server/config/env.ts`. The admin screen only shows whether each one
   is *set*, never its value. An integration without credentials runs
   **log-only**: its rows are recorded as skipped, so nothing is lost or blocked.

### Building blocks (`src/server/integrations/`)

| File | Use it for |
|------|-----------|
| `integration.types.ts` | The `Integration` contract: key, name, settings, `status()`, optional `check()` and `queueStats()` |
| `registry.ts` | The list of all integrations; the admin screen and API read from it |
| `http.ts` | `integrationFetch()`: fetch with a timeout, throws `IntegrationHttpError` with `retryable`. Always use it instead of bare `fetch()` |
| `retry.ts` | `retryDelayMinutes`, `nextAttemptAt`, `shouldGiveUp` |
| `tally/`, `messaging/`, `webhooks/` | The existing integrations. Copy the closest one |

API (administrators only, permission `settings.manage`):

| Endpoint | Purpose |
|----------|---------|
| `GET /api/v1/integrations` | Status, settings checklist and queue figures for every integration |
| `POST /api/v1/integrations/:key/check` | Live connection check (sends nothing) |
| `GET/POST /api/v1/integrations/webhooks` | List / create webhook endpoints (create returns the secret once) |
| `PATCH/DELETE /api/v1/integrations/webhooks/:id` | Edit, pause/resume (`isActive`), delete |
| `POST /api/v1/integrations/webhooks/:id/test` | Queue a `webhook.test` event |
| `POST /api/v1/integrations/webhooks/:id/rotate-secret` | New signing secret (returned once) |
| `GET /api/v1/integrations/webhooks/deliveries` | Recent deliveries |
| `POST /api/v1/integrations/webhooks/deliveries/:id/retry` | Re-queue a failed delivery |

## Adding a new integration

Start with the scaffold, which creates the adapter file and prints the
remaining steps:

```bash
npm run integration:new -- shiprocket "Shiprocket" events
```

Then:

1. **Settings.** Add the environment variables to `src/server/config/env.ts`
   (optional where the integration can run log-only), to `.env.example`, and to
   the README table.
2. **Client.** Write the provider client next to the adapter, e.g.
   `src/server/integrations/shiprocket/shiprocket-client.ts`. Use
   `integrationFetch()`. Put an interface in front of it so tests can pass a
   fake client, like `TallyClient` and `ChannelProviders` do.
3. **Adapter.** Fill in the generated `*.integration.ts`:
   - `settings`, which feed the checklist on the admin screen;
   - `status()`, which returns `active` / `log-only` / `simulated` / `disabled` / `misconfigured` with a single sentence;
   - `check()`, a side-effect-free call such as fetching the account profile;
   - `queueStats()`, if it has an outbox.
4. **Register** it in `src/server/integrations/registry.ts`. It appears on
   the admin screen straight away.
5. **Outbox, if it sends asynchronously.** Pick the simplest option:
   - To be told about business events, you often don't need a new table.
     Subscribe a webhook endpoint (an external service), or add a consumer of
     `webhook_delivery`.
   - Otherwise add an outbox table modelled on `webhook_delivery` (status,
     attempts, `next_attempt_at`, `locked_until`, `last_error`). Enqueue in the
     business transaction. Copy the `claim … FOR UPDATE SKIP LOCKED` query
     from `webhooks/webhook-delivery.ts`. Call your `deliverDue…()` from
     `scripts/notify.ts`, which runs every minute in production.
6. **Audit** administrative actions (`recordAudit`, add the action to
   `AuditAction`).
7. **Tests**:
   - unit tests for pure logic such as payload mapping and signing;
   - integration tests against `margix_test` covering: enqueued with the
     commit, none on rollback, success, retryable failure, permanent failure.
   - Inject a fake `fetchImpl` or client, as `tests/integration/integrations/webhooks.test.ts` does.
8. **Docs.** Add a section to this file. Its heading must match the adapter's
   `docsAnchor`.

## Tally Prime

Every posted stock document (GRN, dispatch, transfer, returns, adjustments,
opening stock, reversals) queues a `tally_sync_job` in the same transaction.
The `tally-sync` worker pushes it as a Stock Journal voucher. Code:
`src/server/modules/tally/`. Operations screen: **Administration → Tally sync**.

| Variable | Meaning |
|----------|---------|
| `TALLY_MODE` | `mock` (accepts everything, for testing), `fail` (simulates an outage), `xml` (real Tally Prime), `disabled` |
| `TALLY_URL` | Tally's HTTP server, e.g. `http://tally-pc:9000`. In Tally: *F1 Help → Settings → Connectivity → Client/Server = Both, port 9000* |
| `TALLY_COMPANY` | Company name exactly as loaded in Tally (required for `xml`) |
| `TALLY_TIMEOUT_MS` | Per-request timeout |

Setup: map godowns (`tallyGodownName`) and products (`tallyStockItemName`) in
the masters, set `TALLY_MODE=xml`, then use **Check connection**. It asks
Tally's server whether it is running and posts nothing.

## E-mail (SMTP)

Low-stock and slow-moving alerts, daily digests and test messages. Any SMTP
server works. With Gmail, use an [app password](https://support.google.com/accounts/answer/185833).

| Variable | Example |
|----------|---------|
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` / `SMTP_SECURE` | `587` / `false` (STARTTLS), or `465` / `true` |
| `SMTP_USER`, `SMTP_PASSWORD` | Mailbox login and app password |
| `SMTP_FROM` | `Margix IMS <alerts@example.com>` |

**Check connection** runs the SMTP handshake and login without sending
anything. Use **Administration → Notifications → Send test** for a real message.

## WhatsApp (Meta Cloud API)

Uses Meta's WhatsApp Cloud API. Business-initiated messages must use
pre-approved **templates**.

1. In Meta Business Manager, create an app with WhatsApp. Note the **phone
   number ID** and create a permanent **system-user access token**.
2. Create and get approval for two templates:
   - low-stock alert, with body parameters: product, current stock, minimum;
   - summary, with one body parameter: the text.
3. Set `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`,
   `WHATSAPP_TEMPLATE_LOW_STOCK`, `WHATSAPP_TEMPLATE_SUMMARY` (and
   `WHATSAPP_TEMPLATE_LANGUAGE` if not `en`).
4. **Check connection** looks up the phone number's display name and sends
   nothing. Recipients must have opted in to your business.

## In-app notifications

The bell in the top bar. No configuration. Recipients are chosen per rule
under **Administration → Notifications**.

## Webhooks

Webhooks push business events to any system that accepts HTTPS callbacks,
such as your own ERP, a Zapier/Make/n8n flow, or a BI pipeline. Add
endpoints under **Administration → Integrations → Webhook endpoints**.

### Events

Catalogue: `src/lib/webhook-events.ts`. Subscribe to specific events, or to
`*` for all events (including ones added later).

| Group | Events |
|-------|--------|
| Purchasing | `purchase_order.created`, `.submitted`, `.cancelled`, `.short_closed`, `goods_receipt.posted`, `supplier_return.posted` |
| Sales | `invoice.created`, `invoice.cancelled`, `dispatch.posted`, `customer_return.posted` |
| Inventory | `transfer.posted`, `adjustment.approved`, `opening_stock.posted`, `ledger_entry.reversed`, `stock.low` |
| Masters | `product.created/.updated`, `customer.created/.updated`, `supplier.created/.updated` |
| System | `webhook.test` |

Most events come from the audit trail. An audited action is mapped to an
event in `webhooks/webhook-emitter.ts` (`AUDIT_EVENTS`), so **adding an event
is two lines**:

1. add it to `WEBHOOK_EVENTS`;
2. map its audit action.

Events not tied to an audit record are emitted directly with
`emitWebhookEvent(tx, "stock.low", data)` inside the transaction (see
`alerts.service.ts`).

### Request

```http
POST /your/endpoint HTTP/1.1
Content-Type: application/json
User-Agent: Margix-Webhooks/1
X-Margix-Event: goods_receipt.posted
X-Margix-Delivery: 5f0c…            (unique per endpoint and attempt series)
X-Margix-Signature: t=1790000000,v1=9a3c…

{
  "id": "b1d2…",                     // event id — same for every endpoint; use it to ignore duplicates
  "event": "goods_receipt.posted",
  "occurredAt": "2026-09-25T10:15:00.000Z",
  "data": { "entityType": "Grn", "entityId": "…", …the document as audited… }
}
```

- Any **2xx** response means delivered. Reply quickly and do heavy work
  asynchronously. The timeout is `WEBHOOK_TIMEOUT_MS` (default 10 s).
- **Network errors, timeouts, 408, 429 and 5xx** are retried with backoff
  (6 attempts, about 2 hours).
- **Other 4xx responses** are permanent failures. **Redirects are not
  followed**, and are reported as failures.
- Delivery is **at least once**, so deduplicate on `id`. Order is not
  guaranteed, so use `occurredAt`.

### Verifying the signature

The signature is `HMAC-SHA256(secret, "<t>.<raw body>")` in hex. Always
compute it over the **raw** request body, before JSON parsing, and reject
timestamps older than 5 minutes. The secret (`whsec_…`) is shown once, when
the endpoint is created or its secret is rotated.

Node.js / Express:

```js
import crypto from "node:crypto";

app.post("/hooks/margix", express.raw({ type: "application/json" }), (req, res) => {
  const header = req.get("X-Margix-Signature") ?? "";
  const { t, v1 } = Object.fromEntries(header.split(",").map((p) => p.split("=")));
  const expected = crypto.createHmac("sha256", process.env.MARGIX_WEBHOOK_SECRET).update(`${t}.${req.body}`).digest("hex");
  const fresh = Math.abs(Date.now() / 1000 - Number(t)) < 300;
  if (!fresh || !v1 || !crypto.timingSafeEqual(Buffer.from(v1, "hex"), Buffer.from(expected, "hex"))) return res.sendStatus(401);
  const event = JSON.parse(req.body);
  // … handle event.event / event.data, deduplicate on event.id …
  res.sendStatus(204);
});
```

Python / Flask:

```python
import hmac, hashlib, time
from flask import request, abort

@app.post("/hooks/margix")
def margix_hook():
    parts = dict(p.split("=", 1) for p in request.headers.get("X-Margix-Signature", "").split(","))
    t, v1 = parts.get("t", "0"), parts.get("v1", "")
    expected = hmac.new(SECRET.encode(), f"{t}.".encode() + request.get_data(), hashlib.sha256).hexdigest()
    if abs(time.time() - int(t)) > 300 or not hmac.compare_digest(v1, expected):
        abort(401)
    event = request.get_json()
    return "", 204
```

A reference implementation, `verifyWebhookSignature()`, is in
`src/server/integrations/webhooks/webhook-signature.ts`.

### Security

- Endpoints must be public `https://` URLs. Loopback, private, link-local and
  CGNAT addresses (including the cloud metadata address) are refused when the
  endpoint is saved, which guards against SSRF.
- For an on-premise receiver on the LAN, set
  `WEBHOOK_ALLOW_PRIVATE_URLS=true`.
- Rotating the secret invalidates the old one immediately.
- Creating, changing, deleting, testing and retrying are all written to the
  audit trail.

## Troubleshooting

| Symptom | Where to look |
|---------|---------------|
| An integration shows **Log-only** | Its required settings are not set. The checklist on the card shows which ones |
| **Needs setup** | Partly configured, e.g. `TALLY_MODE=xml` without `TALLY_COMPANY`, or WhatsApp without templates |
| "Waiting" keeps growing | The worker isn't running. Production: `podman logs margix-notify-1` / `margix-tally-sync-1`. Locally: `npm run notify:run` / `npm run tally:sync` |
| Failed deliveries | The card's *Last error*, and the per-row error under Recent deliveries (webhooks), Notifications (messages) or Tally sync. Fix the cause, then **Retry** |
| Check connection times out | The server cannot reach the host: firewall, DNS, VPN or Tailscale, or Tally not running |
