import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';

export interface SchemaStatus {
  /** ok: every table is there. missing: some are not. unknown: the check could not be made. */
  state: 'ok' | 'missing' | 'unknown';
  expected: number;
  missing: string[];
}

/**
 * Does the database have every table this version of the server needs? The server creates its tables when it starts
 * (a schema push, then the permission sync). If that did not finish, a feature that uses a missing table fails with a
 * database error. This says so plainly, in the start-up log, on the health route and on the Administrator's Control Center,
 * instead of leaving it to surface as a mystery "unexpected error" on one screen.
 */
@Injectable()
export class SchemaCheckService implements OnApplicationBootstrap {
  private readonly log = new Logger('SchemaCheck');
  constructor(private readonly prisma: PrismaService) {}

  /** The table each model in the schema should have, by its real name in the database. */
  expectedTables(): string[] {
    return Prisma.dmmf.datamodel.models.map((m) => m.dbName ?? m.name);
  }

  async check(): Promise<SchemaStatus> {
    const expected = this.expectedTables();
    try {
      const rows = (await this.prisma.$queryRaw`SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema()`) as { table_name?: unknown }[];
      if (!Array.isArray(rows) || rows.length === 0 || typeof rows[0]?.table_name !== 'string') return { state: 'unknown', expected: expected.length, missing: [] };
      const have = new Set(rows.map((r) => r.table_name));
      const missing = expected.filter((t) => !have.has(t)).sort();
      return { state: missing.length ? 'missing' : 'ok', expected: expected.length, missing };
    } catch {
      return { state: 'unknown', expected: expected.length, missing: [] };
    }
  }

  async onApplicationBootstrap() {
    const s = await this.check();
    if (s.state === 'ok') this.log.log(`[startup] Schema check: all ${s.expected} tables are present.`);
    else if (s.state === 'missing') {
      this.log.error(`[startup] SCHEMA CHECK FAILED: the database is missing ${s.missing.length} of ${s.expected} tables: ${s.missing.join(', ')}. Features that use them will fail until they exist. The schema push at start-up should have created them; read the lines above this one for why it did not.`);
    } else this.log.warn('[startup] Schema check could not be completed.');
  }
}
