import { z } from "zod";
import { NOTIFICATION_ALERT_TYPES, NOTIFICATION_CHANNELS, NOTIFICATION_FREQUENCIES, ROLE_CODES } from "@/lib/enums";
import { idSchema, optionalText } from "./common";

/** "HH:MM", 24-hour clock (IST). */
export const timeOfDaySchema = z
  .string({ error: "Time is required." })
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter a time as HH:MM (24-hour).");

const emailSchema = z.string().trim().toLowerCase().pipe(z.email("Enter valid e-mail addresses."));

/**
 * WhatsApp number with country code; spaces, dashes, brackets and a leading
 * "+" are dropped, e.g. "+91 98765 43210" → "919876543210".
 */
export const whatsappNumberSchema = z
  .string()
  .transform((v) => v.replace(/[\s\-()]/g, "").replace(/^\+/, ""))
  .pipe(z.string().regex(/^[1-9]\d{7,14}$/, "Enter WhatsApp numbers with the country code, e.g. +91 98765 43210."));

function uniqueList<T extends z.ZodType>(item: T, max: number) {
  return z
    .array(item)
    .max(max)
    .transform((values) => [...new Set(values as unknown[])] as z.output<T>[]);
}

export const notificationRuleSchema = z
  .object({
    isEnabled: z.boolean(),
    frequency: z.enum(NOTIFICATION_FREQUENCIES),
    digestTime: timeOfDaySchema,
    inAppEnabled: z.boolean(),
    emailEnabled: z.boolean(),
    whatsappEnabled: z.boolean(),
    inAppRoles: uniqueList(z.enum(ROLE_CODES), ROLE_CODES.length),
    inAppUserIds: uniqueList(idSchema, 100),
    emailRecipients: uniqueList(emailSchema, 50),
    whatsappRecipients: uniqueList(whatsappNumberSchema, 50),
  })
  .superRefine((rule, ctx) => {
    if (rule.inAppEnabled && rule.inAppRoles.length === 0 && rule.inAppUserIds.length === 0) {
      ctx.addIssue({ code: "custom", path: ["inAppRoles"], message: "Choose at least one role or user." });
    }
    if (rule.emailEnabled && rule.emailRecipients.length === 0) {
      ctx.addIssue({ code: "custom", path: ["emailRecipients"], message: "Add at least one e-mail address." });
    }
    if (rule.whatsappEnabled && rule.whatsappRecipients.length === 0) {
      ctx.addIssue({ code: "custom", path: ["whatsappRecipients"], message: "Add at least one WhatsApp number." });
    }
  });

export const notificationAlertTypeSchema = z.enum(NOTIFICATION_ALERT_TYPES);

export const notificationChannelSchema = z.enum(NOTIFICATION_CHANNELS);

/** "Send test": e-mail address or WhatsApp number (in-app always goes to the caller). */
export const notificationTestSchema = z.object({ recipient: optionalText(200) });

export const notificationListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type NotificationRuleInput = z.infer<typeof notificationRuleSchema>;
