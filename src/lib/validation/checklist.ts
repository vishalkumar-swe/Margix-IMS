import { z } from "zod";
import { CHECKLIST_SYSTEM_ITEM_KEYS } from "@/lib/checklist";
import { ROLE_CODES } from "@/lib/enums";
import { optionalText, requiredText } from "./common";
import { timeOfDaySchema } from "./notifications";

/** Which system items appear, and the login / logout behaviour. */
export const checklistSettingsSchema = z.object({
  disabledItems: z
    .array(z.enum(CHECKLIST_SYSTEM_ITEM_KEYS))
    .transform((keys) => [...new Set(keys)]),
  showOnLogin: z.boolean(),
  confirmOnLogout: z.boolean(),
});

const taskFields = {
  title: requiredText(120, "Title"),
  description: optionalText(500),
  /** Empty = every role. */
  roles: z.array(z.enum(ROLE_CODES)).transform((roles) => [...new Set(roles)]),
  dueTime: z.preprocess((v) => (v === "" ? undefined : v), timeOfDaySchema.optional()),
  isActive: z.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
};

export const checklistTaskSchema = z.object(taskFields);

export const checklistCompletionSchema = z.object({ done: z.boolean() });

export type ChecklistSettings = z.infer<typeof checklistSettingsSchema>;
export type ChecklistTaskInput = z.infer<typeof checklistTaskSchema>;
