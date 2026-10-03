/**
 * Removes roles that no longer exist in the company's structure from a
 * live database. `sync-permissions.ts` only ever creates and updates the
 * roles listed in the seed; it never deletes one, so a role dropped from
 * the seed would otherwise live on in production with its permissions
 * intact, and anyone still holding it would keep that access.
 *
 * Idempotent and safe to run on every deploy: once a role is gone this is
 * a no-op. It is also deliberately NON-FATAL. It runs in the container's
 * startup chain, and a clean-up task must never be the reason the API
 * fails to boot, so every failure is logged and the process exits 0.
 *
 * What happens to people who held a retired role:
 *  - the role assignment (and its scopes) is removed;
 *  - if that leaves them with no role at all, the account is set to
 *    DISABLED rather than left as a signed-in user who can see nothing.
 *    Nothing is deleted and no one is moved into another role on their
 *    behalf: an administrator re-enables the account and assigns the right
 *    role from the Users page. They are listed in the output below.
 */
import { PrismaClient } from '@prisma/client';

// FINANCE_OFFICER: merged into FINANCE_DIRECTOR, who is now the single
// owner of everything financial.
const RETIRED_ROLE_CODES = ['FINANCE_OFFICER'];

export interface RetireResult {
  /** false when the role was already gone. */
  removed: boolean;
  assignmentsCleared: number;
  /** Accounts that held only this role and were set to DISABLED. */
  disabled: string[];
}

/** The whole of the logic, taking the client as a parameter so it can be
 * exercised against a mock. Throws on failure; the caller decides that a
 * failure is non-fatal. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function retireRole(prisma: any, code: string): Promise<RetireResult> {
  const role = await prisma.role.findUnique({ where: { code } });
  if (!role) return { removed: false, assignmentsCleared: 0, disabled: [] };

  const holders = await prisma.userRole.findMany({
    where: { roleId: role.id },
    include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
  });

  const disabled: string[] = [];
  for (const h of holders) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await prisma.$transaction(async (tx: any) => {
      await tx.userScope.deleteMany({ where: { userRoleId: h.id } });
      await tx.userRole.delete({ where: { id: h.id } });
      const remaining = await tx.userRole.count({ where: { userId: h.userId } });
      if (remaining === 0) {
        await tx.user.update({ where: { id: h.userId }, data: { status: 'DISABLED' } });
        disabled.push(`${h.user.firstName} ${h.user.lastName} <${h.user.email}>`);
      }
    });
  }

  await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
  await prisma.role.delete({ where: { id: role.id } });
  return { removed: true, assignmentsCleared: holders.length, disabled };
}

async function main() {
  const prisma = new PrismaClient();
  try {
    for (const code of RETIRED_ROLE_CODES) {
      try {
        const r = await retireRole(prisma, code);
        if (!r.removed) {
          console.log(`[retire-roles] ${code}: already gone, nothing to do.`);
          continue;
        }
        console.log(`[retire-roles] ${code}: removed (${r.assignmentsCleared} assignment(s) cleared).`);
        if (r.disabled.length > 0) {
          console.log(`[retire-roles] ${code}: ${r.disabled.length} account(s) had no other role and were DISABLED - re-enable and assign a role from the Users page:`);
          r.disabled.forEach((d) => console.log(`[retire-roles]   - ${d}`));
        }
      } catch (err) {
        console.error(`[retire-roles] ${code}: could not be removed this time (will retry on the next start):`, err);
      }
    }
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

// Only when run directly (the container's startup chain), never on import.
if (require.main === module) {
  main()
    .catch((err) => console.error('[retire-roles] unexpected failure (ignored so startup continues):', err))
    .finally(() => process.exit(0));
}
