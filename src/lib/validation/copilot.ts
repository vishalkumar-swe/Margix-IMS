import { z } from "zod";
import { ROLE_CODES } from "@/lib/enums";

/** Browser state sent with a Copilot question (PRD §5.1). */
export const copilotRuntimeContextSchema = z.object({
  route: z.string().trim().min(1).max(300),
  pageTitle: z.string().trim().max(200).optional(),
  role: z.enum(ROLE_CODES),
  form: z.record(z.string().max(60), z.string().max(300)).optional(),
  focused: z.string().max(120).optional(),
  error: z
    .object({
      code: z.string().trim().min(1).max(80),
      message: z.string().trim().max(1000),
      details: z.unknown().optional(),
    })
    .optional(),
  recentErrors: z.array(z.string().max(500)).max(5).optional(),
});

export const copilotActionTypeSchema = z.enum([
  "CANCEL_INVOICE",
  "CANCEL_PO",
  "SHORT_CLOSE_PO",
  "REVERSE_LEDGER",
  "PURGE_SANDBOX",
  "SEED_SANDBOX",
  "POST_DISPATCH",
  "CREATE_PO",
  "CREATE_INVOICE",
  "CREATE_GRN",
  "CREATE_SKU",
  "CREATE_CUSTOMER",
  "CREATE_SUPPLIER",
  "CREATE_GODOWN",
  "STOCK_ADJUSTMENT",
]);

export const copilotConfirmationSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  actionType: copilotActionTypeSchema,
  payload: z.record(z.string(), z.unknown()),
  destructive: z.boolean(),
  confirmLabel: z.string().optional(),
  cancelLabel: z.string().optional(),
  alternatives: z
    .array(
      z.object({
        label: z.string(),
        action: z.string(),
        payload: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .optional(),
  status: z.enum(["pending", "confirmed", "cancelled", "executed", "failed"]),
  resultMessage: z.string().optional(),
});

export const copilotChatSchema = z.object({
  message: z.string().trim().min(1, "Ask a question.").max(1200),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(4000),
        confirmation: copilotConfirmationSchema.nullable().optional(),
      }),
    )
    .max(24)
    .default([]),
  context: copilotRuntimeContextSchema,
});

export const copilotConfirmExecutionSchema = z.object({
  confirmationId: z.string().min(1),
  actionType: copilotActionTypeSchema,
  payload: z.record(z.string(), z.unknown()),
  decision: z.enum(["confirm", "cancel", "alternative"]),
  alternativeAction: z.string().optional(),
  reason: z.string().max(500).optional(),
});

export type CopilotChatInput = z.infer<typeof copilotChatSchema>;
export type CopilotConfirmExecutionInput = z.infer<typeof copilotConfirmExecutionSchema>;
