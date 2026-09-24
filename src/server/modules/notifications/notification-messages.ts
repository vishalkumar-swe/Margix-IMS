import type { NotificationAlertType } from "@prisma/client";
import { formatDate } from "@/lib/dates";
import { formatQuantity } from "@/lib/format";

/**
 * Message texts for every channel (pure functions, no I/O). A message is
 * rendered once, when it is queued, so what people receive describes the
 * stock at the moment the alert was raised.
 */

/** One product line of an alert message. Quantities are decimal strings. */
export interface AlertLine {
  skuCode: string;
  skuName: string;
  godownName: string;
  unit: string;
  currentQty: string;
  /** LOW_STOCK: the reorder level. */
  thresholdQty?: string | null;
  /** SLOW_MOVING: whole days without movement. */
  daysIdle?: number | null;
}

/**
 * WhatsApp business-initiated messages must use a pre-approved template:
 * LOW_STOCK takes (product, current stock, minimum); SUMMARY takes one text.
 */
export interface WhatsappContent {
  template: "LOW_STOCK" | "SUMMARY";
  params: string[];
}

export interface NotificationMessage {
  alertType: NotificationAlertType | null;
  /** E-mail subject and in-app title. */
  subject: string;
  /** Plain text body (e-mail, in-app). */
  text: string;
  /** App path the message points to. */
  link: string | null;
  whatsapp: WhatsappContent;
}

/** WhatsApp template parameters: one line, at most 1024 characters. */
const WHATSAPP_PARAM_MAX = 1024;
/** Lines listed in a summary before "…and N more". */
const SUMMARY_MAX_LINES = 25;

const qty = (value: string, unit: string) => `${formatQuantity(value)} ${unit}`;
const product = (line: AlertLine) => `${line.skuName} (${line.skuCode})`;

/**
 * The immediate low-stock message, e.g. "Low Stock Alert: Product Resin
 * (RM-001) at Main Warehouse, Current Stock: 8 KG, Minimum Required: 20 KG,
 * Action Required: Reorder stock."
 */
export function lowStockMessage(line: AlertLine): NotificationMessage {
  const current = qty(line.currentQty, line.unit);
  const minimum = qty(line.thresholdQty ?? "0", line.unit);
  const where = `${product(line)} at ${line.godownName}`;
  return {
    alertType: "LOW_STOCK",
    subject: `Low Stock Alert: ${line.skuName} (${line.skuCode})`,
    text:
      `Low Stock Alert: Product ${where}, Current Stock: ${current}, ` +
      `Minimum Required: ${minimum}, Action Required: Reorder stock.`,
    link: "/alerts",
    whatsapp: { template: "LOW_STOCK", params: [oneLine(where), current, minimum] },
  };
}

/** Products newly identified as slow-moving by the daily scan. */
export function slowMovingMessage(lines: AlertLine[], slowStockDays: number): NotificationMessage {
  const heading = `Slow-Moving Stock: ${countOf(lines.length, "product")} with no movement for ${slowStockDays}+ days`;
  return summary("SLOW_MOVING", heading, lines, slowLine, "Action Required: Review stock and plan liquidation or transfers.", "/reports/slow-stock");
}

/** Daily digest of all active alerts of one type. */
export function digestMessage(alertType: NotificationAlertType, lines: AlertLine[], day: string): NotificationMessage {
  const date = formatDate(day);
  if (alertType === "LOW_STOCK") {
    const heading = `Low Stock Digest ${date}: ${countOf(lines.length, "product")} at or below minimum`;
    return summary(alertType, heading, lines, lowLine, "Action Required: Reorder stock.", "/alerts");
  }
  const heading = `Slow-Moving Stock Digest ${date}: ${countOf(lines.length, "product")} without recent movement`;
  return summary(alertType, heading, lines, slowLine, "Action Required: Review stock and plan liquidation or transfers.", "/reports/slow-stock");
}

/** "Send test" from the notification settings screen. */
export function testMessage(channelLabel: string): NotificationMessage {
  const text = `Test message from Margix IMS: ${channelLabel} notifications are working.`;
  return { alertType: null, subject: "Margix IMS test notification", text, link: "/admin/notifications", whatsapp: { template: "SUMMARY", params: [text] } };
}

function lowLine(line: AlertLine): string {
  return `${product(line)} at ${line.godownName}: ${qty(line.currentQty, line.unit)} (minimum ${qty(line.thresholdQty ?? "0", line.unit)})`;
}

function slowLine(line: AlertLine): string {
  return `${product(line)} at ${line.godownName}: ${qty(line.currentQty, line.unit)}, idle ${line.daysIdle ?? "?"} days`;
}

function summary(
  alertType: NotificationAlertType,
  heading: string,
  lines: AlertLine[],
  format: (line: AlertLine) => string,
  action: string,
  link: string,
): NotificationMessage {
  const shown = lines.slice(0, SUMMARY_MAX_LINES).map(format);
  const more = lines.length - shown.length;
  const listed = more > 0 ? [...shown, `…and ${more} more`] : shown;
  const text = [heading, "", ...listed.map((l) => `- ${l}`), "", action].join("\n");
  return {
    alertType,
    subject: heading,
    text,
    link,
    whatsapp: { template: "SUMMARY", params: [oneLine(`${heading}. ${listed.join("; ")}. ${action}`)] },
  };
}

function countOf(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

/** WhatsApp rejects parameters with new lines, tabs or more than four spaces in a row. */
export function oneLine(text: string): string {
  const flat = text.replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim();
  return flat.length > WHATSAPP_PARAM_MAX ? `${flat.slice(0, WHATSAPP_PARAM_MAX - 1)}…` : flat;
}
