import { BackupService } from '../backup.service';
import { AuditService } from '../../audit/audit.service';
import { AuthenticatedUser } from '../../auth/types/authenticated-user';

describe('BackupService', () => {
  const actor = { id: 'admin-1' } as AuthenticatedUser;

  function buildService() {
    const prisma = {
      backupRecord: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 'bk-1', status: 'RUNNING' }),
        update: jest.fn().mockImplementation(({ data }: { data: unknown }) => Promise.resolve({ id: 'bk-1', ...(data as object) })),
      },
    };
    const audit = { record: jest.fn() } as unknown as AuditService;
    return { service: new BackupService(prisma as any, audit), prisma };
  }

  it('records completion with the exact status passed in, not a guessed one', async () => {
    const { service, prisma } = buildService();

    await service.recordCompletion('bk-1', { status: 'FAILED', notes: 'Disk full' }, actor);

    expect(prisma.backupRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
    );
  });

  it('status() queries independently for last success, last failure, and any currently running backup', async () => {
    const { service, prisma } = buildService();

    await service.status();

    expect(prisma.backupRecord.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { status: 'SUCCESS' } }));
    expect(prisma.backupRecord.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { status: 'FAILED' } }));
    expect(prisma.backupRecord.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { status: 'RUNNING' } }));
  });
});
