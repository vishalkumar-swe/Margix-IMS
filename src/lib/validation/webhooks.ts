import { z } from "zod";
import { ALL_WEBHOOK_EVENTS, WEBHOOK_EVENT_NAMES } from "@/lib/webhook-events";

const eventSchema = z
  .string()
  .refine((event) => event === ALL_WEBHOOK_EVENTS || WEBHOOK_EVENT_NAMES.includes(event), "Unknown event.");

export const webhookEndpointSchema = z.object({
  name: z.string({ error: "Name is required." }).trim().min(1, "Name is required.").max(80),
  url: z
    .string({ error: "URL is required." })
    .trim()
    .max(2000)
    .pipe(z.url({ protocol: /^https?$/, error: "Enter a full http(s) URL, e.g. https://example.com/margix-hook." })),
  events: z
    .array(eventSchema)
    .min(1, "Choose at least one event.")
    .transform((events) => (events.includes(ALL_WEBHOOK_EVENTS) ? [ALL_WEBHOOK_EVENTS] : [...new Set(events)])),
  isActive: z.boolean().default(true),
});

export type WebhookEndpointInput = z.infer<typeof webhookEndpointSchema>;

export const webhookEndpointUpdateSchema = webhookEndpointSchema.partial();
