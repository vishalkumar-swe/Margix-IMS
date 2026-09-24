import { describe, expect, it } from "vitest";
import { checklistTaskSchema } from "@/lib/validation/checklist";
import { notificationRuleSchema, whatsappNumberSchema } from "@/lib/validation/notifications";
import { stockAgingSettingsSchema } from "@/lib/validation/settings";

const rule = {
  isEnabled: true,
  frequency: "IMMEDIATE",
  digestTime: "09:00",
  inAppEnabled: true,
  emailEnabled: false,
  whatsappEnabled: false,
  inAppRoles: ["ADMIN"],
  inAppUserIds: [],
  emailRecipients: [],
  whatsappRecipients: [],
};

describe("notification rule validation", () => {
  it("normalises WhatsApp numbers to digits with country code", () => {
    expect(whatsappNumberSchema.parse("+91 98765-43210")).toBe("919876543210");
    expect(whatsappNumberSchema.safeParse("98765").success).toBe(false);
    expect(whatsappNumberSchema.safeParse("+0 123 456 789").success).toBe(false);
  });

  it("lower-cases and de-duplicates e-mail recipients", () => {
    const parsed = notificationRuleSchema.parse({
      ...rule,
      emailEnabled: true,
      emailRecipients: ["Buyer@Example.com", "buyer@example.com", "ops@example.com"],
    });
    expect(parsed.emailRecipients).toEqual(["buyer@example.com", "ops@example.com"]);
  });

  it("requires recipients for every enabled channel", () => {
    const result = notificationRuleSchema.safeParse({ ...rule, inAppRoles: [], emailEnabled: true, whatsappEnabled: true });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path.join("."))).toEqual(["inAppRoles", "emailRecipients", "whatsappRecipients"]);
  });

  it("accepts only HH:MM digest times", () => {
    expect(notificationRuleSchema.safeParse({ ...rule, digestTime: "9:00" }).success).toBe(false);
    expect(notificationRuleSchema.safeParse({ ...rule, digestTime: "24:00" }).success).toBe(false);
    expect(notificationRuleSchema.safeParse({ ...rule, digestTime: "23:59" }).success).toBe(true);
  });
});

describe("settings validation", () => {
  it("keeps dead stock at least as long as slow stock", () => {
    expect(stockAgingSettingsSchema.safeParse({ slowStockDays: 60, deadStockDays: 30, scanTime: "08:00" }).success).toBe(false);
    expect(stockAgingSettingsSchema.parse({ slowStockDays: "45", deadStockDays: "45", scanTime: "08:00" })).toEqual({
      slowStockDays: 45,
      deadStockDays: 45,
      scanTime: "08:00",
    });
  });

  it("treats an empty due time as none", () => {
    const task = checklistTaskSchema.parse({ title: " Call suppliers ", roles: [], dueTime: "", isActive: true });
    expect(task).toMatchObject({ title: "Call suppliers", dueTime: undefined, sortOrder: 0 });
  });
});
