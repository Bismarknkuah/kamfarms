import { retireRole } from '../../../../prisma/retire-roles';

// Exercises the live-database role retirement against a mock, because it
// disables accounts and deletes a role - not something to trust unrun.
function build(opts: { role?: { id: string } | null; holders?: Array<{ id: string; userId: string; user: Record<string, string> }>; otherRoleCount?: Record<string, number> } = {}) {
  const calls: string[] = [];
  const tx = {
    userScope: { deleteMany: jest.fn(async ({ where }: any) => { calls.push(`scopes:${where.userRoleId}`); }) },
    userRole: {
      delete: jest.fn(async ({ where }: any) => { calls.push(`unassign:${where.id}`); }),
      count: jest.fn(async ({ where }: any) => (opts.otherRoleCount ?? {})[where.userId] ?? 0),
    },
    user: { update: jest.fn(async ({ where, data }: any) => { calls.push(`user:${where.id}:${data.status}`); }) },
  };
  const prisma = {
    role: { findUnique: jest.fn(async () => (opts.role === undefined ? { id: 'role-fo' } : opts.role)), delete: jest.fn(async () => { calls.push('role-deleted'); }) },
    userRole: { findMany: jest.fn(async () => opts.holders ?? []) },
    rolePermission: { deleteMany: jest.fn(async () => { calls.push('role-permissions-deleted'); }) },
    $transaction: jest.fn(async (cb: any) => cb(tx)),
  };
  return { prisma, tx, calls };
}

const person = (id: string, first: string) => ({ id: `ur-${id}`, userId: id, user: { id, email: `${first.toLowerCase()}@kam.local`, firstName: first, lastName: 'Test' } });

describe('retireRole', () => {
  it('does nothing when the role is already gone (safe to run on every deploy)', async () => {
    const { prisma, calls } = build({ role: null });
    expect(await retireRole(prisma, 'FINANCE_OFFICER')).toEqual({ removed: false, assignmentsCleared: 0, disabled: [] });
    expect(calls).toEqual([]);
    expect(prisma.role.delete).not.toHaveBeenCalled();
  });

  it('removes the role and its permission grants when nobody holds it', async () => {
    const { prisma, calls } = build({ holders: [] });
    const r = await retireRole(prisma, 'FINANCE_OFFICER');
    expect(r).toEqual({ removed: true, assignmentsCleared: 0, disabled: [] });
    expect(calls).toEqual(['role-permissions-deleted', 'role-deleted']);
  });

  it('disables an account whose only role was the retired one, rather than leaving a signed-in user with no access', async () => {
    const { prisma, calls } = build({ holders: [person('u1', 'Adwoa')], otherRoleCount: { u1: 0 } });
    const r = await retireRole(prisma, 'FINANCE_OFFICER');
    expect(r.disabled).toEqual(['Adwoa Test <adwoa@kam.local>']);
    expect(calls).toContain('user:u1:DISABLED');
  });

  it('keeps an account active when they hold another role, and never moves anyone into a different role', async () => {
    const { prisma, calls, tx } = build({ holders: [person('u2', 'Kwesi')], otherRoleCount: { u2: 1 } });
    const r = await retireRole(prisma, 'FINANCE_OFFICER');
    expect(r.disabled).toEqual([]);
    expect(calls.some((c) => c.startsWith('user:'))).toBe(false);
    expect(calls).toEqual(['scopes:ur-u2', 'unassign:ur-u2', 'role-permissions-deleted', 'role-deleted']);
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('handles a mix: clears every assignment, disables only those left roleless', async () => {
    const { prisma } = build({ holders: [person('a', 'Ama'), person('b', 'Yaw')], otherRoleCount: { a: 0, b: 2 } });
    const r = await retireRole(prisma, 'FINANCE_OFFICER');
    expect(r.assignmentsCleared).toBe(2);
    expect(r.disabled).toEqual(['Ama Test <ama@kam.local>']);
  });

  it('deletes the role last, only after every assignment is cleared (so the foreign key never blocks it)', async () => {
    const { prisma, calls } = build({ holders: [person('a', 'Ama')], otherRoleCount: { a: 0 } });
    await retireRole(prisma, 'FINANCE_OFFICER');
    expect(calls.indexOf('role-deleted')).toBe(calls.length - 1);
    expect(calls.indexOf('unassign:ur-a')).toBeLessThan(calls.indexOf('role-deleted'));
  });

  it('propagates a failure so the caller can decide it is non-fatal (the role is NOT deleted half-done)', async () => {
    const { prisma, calls } = build({ holders: [person('a', 'Ama')] });
    prisma.$transaction.mockRejectedValueOnce(new Error('db down'));
    await expect(retireRole(prisma, 'FINANCE_OFFICER')).rejects.toThrow('db down');
    expect(calls).not.toContain('role-deleted');
  });
});
