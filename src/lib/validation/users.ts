import { z } from "zod";
import { ROLE_CODES } from "@/lib/enums";
import { optionalText, requiredText } from "./common";

export { ROLE_CODES } from "@/lib/enums";

/** Password policy (single source of truth). */
export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters.")
  .max(200)
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), "Use letters and at least one digit.");

export const userCreateSchema = z.object({
  name: requiredText(120, "Name"),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email.")),
  mobile: optionalText(20),
  role: z.enum(ROLE_CODES),
  password: passwordSchema,
});

export const userUpdateSchema = z.object({
  name: requiredText(120, "Name").optional(),
  mobile: optionalText(20),
  role: z.enum(ROLE_CODES).optional(),
  isActive: z.boolean().optional(),
});

export const passwordResetSchema = z.object({ password: passwordSchema });

export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password.").max(200),
    newPassword: passwordSchema,
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    path: ["newPassword"],
    message: "Choose a password different from the current one.",
  });

export type UserCreateInput = z.infer<typeof userCreateSchema>;
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;
export type PasswordChangeInput = z.infer<typeof passwordChangeSchema>;
