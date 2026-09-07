import { BadRequestException } from '@nestjs/common';
import { RolesService } from '../roles.service';
import { AuditService } from '../../audit/audit.service';
import { AuthenticatedUser } from '../../auth/types/authenticated-user';

describe('RolesService.updateDetails', () => {
  const actor = { id: 'admin-1' } as AuthenticatedUser;

  function buildService(role: Record<string, unknown>) {
    const updated = { ...role };
    const prisma = {
      role: {
        findUnique: jest.fn().mockImplementation(() => Promise.resolve({ ...updated, permissions: [] })),
        update: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
          Object.assign(updated, data);
          return Promise.resolve(updated);
        }),
        delete: jest.fn(),
      },
    };
    const audit = { record: jest.fn() } as unknown as AuditService;
    const service = new RolesService(prisma as any, audit);
    return { service, prisma, updated };
  }

  it('renames only the display name, leaving the role code untouched', async () => {
    const { service, updated } = buildService({ id: 'r1', code: 'FARM_MANAGER', name: 'Farm Manager', description: 'Old desc', isSystemRole: true, permissions: [] });
    await service.updateDetails('FARM_MANAGER', { name: 'Farm Operations Lead' }, actor);
    expect(updated.name).toBe('Farm Operations Lead');
    expect(updated.code).toBe('FARM_MANAGER');
  });

  it('leaves the name unchanged when only description is given', async () => {
    const { service, updated } = buildService({ id: 'r1', code: 'FARM_MANAGER', name: 'Farm Manager', description: 'Old desc', isSystemRole: true, permissions: [] });
    await service.updateDetails('FARM_MANAGER', { description: 'New desc' }, actor);
    expect(updated.name).toBe('Farm Manager');
    expect(updated.description).toBe('New desc');
  });

  it('works on system roles too - renaming the label is allowed even though deleting the role is not', async () => {
    const { service, updated } = buildService({ id: 'r1', code: 'MD', name: 'Managing Director', description: null, isSystemRole: true, permissions: [] });
    await service.updateDetails('MD', { name: 'Chief of Operations' }, actor);
    expect(updated.name).toBe('Chief of Operations');
  });
});

describe('RolesService.delete', () => {
  const actor = { id: 'admin-1' } as AuthenticatedUser;

  it('refuses to delete a built-in system role', async () => {
    const prisma = {
      role: {
        findUnique: jest.fn().mockResolvedValue({ id: 'r1', code: 'MD', isSystemRole: true, permissions: [] }),
        delete: jest.fn(),
      },
    };
    const audit = { record: jest.fn() } as unknown as AuditService;
    const service = new RolesService(prisma as any, audit);

    await expect(service.delete('MD', actor)).rejects.toThrow(BadRequestException);
    expect(prisma.role.delete).not.toHaveBeenCalled();
  });

  it('allows deleting a custom, non-system role', async () => {
    const prisma = {
      role: {
        findUnique: jest.fn().mockResolvedValue({ id: 'r2', code: 'CUSTOM_ROLE', isSystemRole: false, permissions: [] }),
        delete: jest.fn().mockResolvedValue({}),
      },
    };
    const audit = { record: jest.fn() } as unknown as AuditService;
    const service = new RolesService(prisma as any, audit);

    const result = await service.delete('CUSTOM_ROLE', actor);
    expect(result.success).toBe(true);
    expect(prisma.role.delete).toHaveBeenCalledWith({ where: { id: 'r2' } });
  });
});
