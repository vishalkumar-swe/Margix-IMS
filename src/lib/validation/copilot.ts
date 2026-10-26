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

export const copilotChatSchema = z.object({
  message: z.string().trim().min(1, "Ask a question.").max(1200),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(4000),
      }),
    )
    .max(24)
    .default([]),
  context: copilotRuntimeContextSchema,
});

export type CopilotChatInput = z.infer<typeof copilotChatSchema>;
