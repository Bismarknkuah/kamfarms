import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

/**
 * The rule: whoever rejects anything must say why. Rather than listing today's reject endpoints, this finds every
 * reject-*.dto.ts in the code base, so a rejection added next year is held to the same rule automatically.
 */
function rejectDtoFiles(dir: string, found: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (entry.name !== 'node_modules' && entry.name !== '__tests__') rejectDtoFiles(full, found); }
    else if (/^reject-.*\.dto\.ts$/.test(entry.name)) found.push(full);
  }
  return found;
}

const files = rejectDtoFiles(path.resolve(__dirname, '..', '..'));
const messages = async (cls: new () => object, body: unknown) => (await validate(plainToInstance(cls, body) as object)).flatMap((e) => Object.values(e.constraints ?? {}));

describe('every rejection needs a comment', () => {
  it('finds the rejection forms in the system (so this test cannot quietly check nothing)', () => {
    expect(files.length).toBeGreaterThanOrEqual(8);
  });

  it.each(files.map((f) => [path.relative(path.resolve(__dirname, '..', '..'), f), f]))('%s refuses a missing, blank or token comment, and accepts a real one', async (_name, file) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require(file as string);
    const cls = Object.values(mod).find((v) => typeof v === 'function') as new () => object;
    expect(cls).toBeDefined();

    for (const bad of [undefined, '', '   ', '\n\t ', 'ab', '  a ']) {
      expect((await messages(cls, { reason: bad })).length).toBeGreaterThan(0);
    }
    expect(await messages(cls, { reason: 'Receipt does not match the amount' })).toEqual([]);
    // Spaces around a real comment are removed, not rejected.
    const trimmed = plainToInstance(cls, { reason: '   Receipt does not match   ' }) as { reason: string };
    expect(trimmed.reason).toBe('Receipt does not match');
  });
});
