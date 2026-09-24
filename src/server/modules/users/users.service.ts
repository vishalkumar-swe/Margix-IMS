import type { UserCreateInput, UserUpdateInput } from "@/lib/validation/users";
import type { Actor } from "@/server/actor";
import { hashPassword } from "@/server/auth/password";
import { deleteUserSessions } from "@/server/auth/session";
import { withTx } from "@/server/db/transaction";
import { ConflictError, NotFoundError } from "@/server/errors";
import { recordAudit } from "@/server/modules/audit/audit.service";
import { publicUserSelect, type PublicUser } from "./users.queries";

export async function createUser(actor: Actor, input: UserCreateInput): Promise<PublicUser> {
  const passwordHash = await hashPassword(input.password);
  return withTx(async (tx) => {
    const role = await tx.role.findUniqueOrThrow({ where: { code: input.role } });
    const user = await tx.user.create({
      data: {
        name: input.name,
        email: input.email,
        mobile: input.mobile,
        roleId: role.id,
        passwordHash,
        passwordChangedAt: new Date(),
      },
      select: publicUserSelect,
    });
    await recordAudit(tx, actor, { action: "USER_CREATED", entityType: "User", entityId: user.id, newData: user });
    return user;
  });
}

/**
 * Updates profile, role or active flag. Administrators cannot deactivate or
 * demote themselves (prevents locking everyone out). A role change or
 * deactivation signs the user out everywhere; profile edits do not.
 */
export async function updateUser(actor: Actor, id: string, input: UserUpdateInput): Promise<PublicUser> {
  if (id === actor.userId && (input.isActive === false || (input.role && input.role !== actor.role))) {
    throw new ConflictError("INVALID_STATE", "You cannot deactivate yourself or change your own role.");
  }

  let accessChanged = false;
  const user = await withTx(async (tx) => {
    const before = await tx.user.findUnique({ where: { id }, select: publicUserSelect });
    if (!before) throw new NotFoundError("User", id);
    accessChanged =
      (input.isActive === false && before.isActive) || (input.role !== undefined && input.role !== before.role.code);

    const roleId = input.role ? (await tx.role.findUniqueOrThrow({ where: { code: input.role } })).id : undefined;
    const after = await tx.user.update({
      where: { id },
      data: { name: input.name, mobile: input.mobile, isActive: input.isActive, roleId },
      select: publicUserSelect,
    });
    await recordAudit(tx, actor, {
      action: "USER_UPDATED",
      entityType: "User",
      entityId: id,
      oldData: before,
      newData: after,
    });
    return after;
  });

  // A role change or deactivation must take effect immediately, not at session expiry.
  if (accessChanged) await deleteUserSessions(id);
  return user;
}

/** Sets a new password, clears any lockout and signs the user out everywhere. */
export async function resetPassword(actor: Actor, id: string, password: string): Promise<void> {
  const passwordHash = await hashPassword(password);
  await withTx(async (tx) => {
    const exists = await tx.user.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundError("User", id);
    await tx.user.update({
      where: { id },
      data: { passwordHash, passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null },
    });
    await recordAudit(tx, actor, { action: "USER_PASSWORD_RESET", entityType: "User", entityId: id });
  });
  await deleteUserSessions(id);
}
