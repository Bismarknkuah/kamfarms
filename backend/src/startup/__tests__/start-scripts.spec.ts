import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const REPO = path.resolve(__dirname, '../../../..');
const PUSH = 'npx prisma@5.22.0 db push --schema=prisma/schema.prisma --accept-data-loss --skip-generate';

/** A copy of the real scripts in an empty folder, with stand-ins for npx and node that record what they were asked to do. */
function sandbox(failing: string[] = []) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kam-start-')));
  fs.mkdirSync(path.join(dir, 'docker')); fs.mkdirSync(path.join(dir, 'bin'));
  for (const f of ['prepare.sh', 'start.sh']) fs.copyFileSync(path.join(REPO, 'docker', f), path.join(dir, 'docker', f));
  const log = path.join(dir, 'calls.log');
  fs.writeFileSync(path.join(dir, 'bin', 'npx'), `#!/bin/sh\necho "npx $* @ $(pwd)" >> "${log}"\nfor f in $FAIL; do case "$*" in *"$f"*) exit 1;; esac; done\nexit 0\n`, { mode: 0o755 });
  fs.writeFileSync(path.join(dir, 'bin', 'node'), `#!/bin/sh\necho "node $* DONE=$STARTUP_TASKS_DONE @ $(pwd)" >> "${log}"\nexit 0\n`, { mode: 0o755 });
  const run = (script: string, cwd = os.tmpdir()) => spawnSync('sh', [path.join(dir, 'docker', script)], { cwd, encoding: 'utf8', env: { PATH: `${path.join(dir, 'bin')}:${process.env.PATH}`, FAIL: failing.join(' ') } });
  const calls = () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').map((l) => l.replace(` @ ${dir}`, '')) : []);
  return { run, calls, dir };
}

describe('docker/prepare.sh: the database steps', () => {
  it('applies the schema, then updates permissions, retired roles and expense categories, in that order, from the repo root wherever it is started', () => {
    const s = sandbox();
    const r = s.run('prepare.sh');
    expect(r.status).toBe(0);
    expect(s.calls()).toEqual([
      PUSH,
      'npx ts-node --transpile-only prisma/sync-permissions.ts',
      'npx ts-node --transpile-only prisma/retire-roles.ts',
      'npx ts-node --transpile-only prisma/sync-expense-categories.ts',
    ]);
    expect(r.stdout).toContain('[startup] 1/4 Applying the database schema (this creates any missing tables)');
    expect(r.stdout).toContain('[startup] Database is ready.');
  });

  it.each(['sync-permissions', 'retire-roles', 'sync-expense-categories'])('carries on, with a warning, if %s fails: the server must still start', (step) => {
    const s = sandbox([step]);
    const r = s.run('prepare.sh');
    expect(r.status).toBe(0);
    expect(s.calls()).toHaveLength(4); // the steps after it still ran
    expect(r.stdout).toMatch(/\[startup\] WARNING: .* failed\. Continuing\./);
  });

  it('stops, with the reason, if the schema cannot be applied: nothing else runs, and it exits with an error', () => {
    const s = sandbox(['push']);
    const r = s.run('prepare.sh');
    expect(r.status).toBe(1);
    expect(s.calls()).toEqual([PUSH]);
    expect(r.stdout).toContain('[startup] ERROR: the database schema could not be applied');
    expect(r.stdout).not.toContain('Database is ready');
  });
});

describe('docker/start.sh: the API\'s start command', () => {
  it('prepares the database, tells the server it has done so, and then runs the server', () => {
    const s = sandbox();
    const r = s.run('start.sh');
    expect(r.status).toBe(0);
    const calls = s.calls();
    expect(calls).toHaveLength(5);
    expect(calls[4]).toBe('node backend/dist/main.js DONE=1');
  });

  it('does not start the server if the schema could not be applied', () => {
    const s = sandbox(['push']);
    expect(s.run('start.sh').status).toBe(1);
    expect(s.calls().some((c) => c.startsWith('node '))).toBe(false);
  });
});

describe('the settings that make the scripts run', () => {
  const read = (f: string) => fs.readFileSync(path.join(REPO, f), 'utf8');
  it('the image starts with the script, and contains it', () => {
    const docker = read('docker/Dockerfile.api');
    expect(docker).toMatch(/^CMD \["sh", "docker\/start\.sh"\]$/m);
    expect(docker).toMatch(/^COPY docker\/prepare\.sh docker\/start\.sh \.\/docker\/$/m);
  });
  it('railway.json pins the same start command, so a stale one in the Railway dashboard cannot skip the database steps, and keeps the health check', () => {
    const deploy = JSON.parse(read('railway.json')).deploy;
    expect(deploy.startCommand).toBe('sh docker/start.sh');
    expect(deploy).toMatchObject({ healthcheckPath: '/api/health', restartPolicyType: 'ON_FAILURE' });
  });
});
