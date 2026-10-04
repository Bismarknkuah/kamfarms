import * as fs from 'fs';
import * as path from 'path';
import { STARTUP_TIMEOUT_MS, runStartupTasks, shouldRunStartupTasks } from '../startup-tasks';

const RAILWAY = { RAILWAY_ENVIRONMENT_NAME: 'production' };
const logger = () => ({ log: jest.fn(), error: jest.fn() });

describe('shouldRunStartupTasks: only when the server was started without the database steps, and only on Railway', () => {
  it('runs on Railway when the start script has not already done the work', () => {
    expect(shouldRunStartupTasks(RAILWAY)).toMatchObject({ run: true });
  });
  it.each(['RAILWAY_ENVIRONMENT_NAME', 'RAILWAY_ENVIRONMENT', 'RAILWAY_PROJECT_ID', 'RAILWAY_SERVICE_ID'])('recognises Railway by %s', (name) => {
    expect(shouldRunStartupTasks({ [name]: 'x' }).run).toBe(true);
  });
  it('does nothing when docker/start.sh has already done it', () => {
    expect(shouldRunStartupTasks({ ...RAILWAY, STARTUP_TASKS_DONE: '1' })).toMatchObject({ run: false, reason: expect.stringContaining('already done') });
  });
  it('does nothing on a developer\'s own computer unless asked, so it can never change a local database by surprise', () => {
    expect(shouldRunStartupTasks({}).run).toBe(false);
    expect(shouldRunStartupTasks({ STARTUP_TASKS: 'on' }).run).toBe(true);
  });
  it('can be switched off, even on Railway', () => {
    expect(shouldRunStartupTasks({ ...RAILWAY, STARTUP_TASKS: 'off' }).run).toBe(false);
  });
});

describe('runStartupTasks', () => {
  it('does nothing, and says nothing, when it should not run', async () => {
    const run = jest.fn(); const l = logger();
    expect(await runStartupTasks({}, run, '/repo', l)).toBe('skipped');
    expect(run).not.toHaveBeenCalled();
    expect(l.log).not.toHaveBeenCalled();
  });

  it('runs docker/prepare.sh from the repo root with a time limit, and says so', async () => {
    const run = jest.fn().mockResolvedValue({ code: 0, timedOut: false }); const l = logger();
    expect(await runStartupTasks(RAILWAY, run, '/repo', l)).toBe('done');
    expect(run).toHaveBeenCalledWith('/repo/docker/prepare.sh', '/repo', STARTUP_TIMEOUT_MS);
    expect(l.log).toHaveBeenCalledWith(expect.stringContaining('[startup] Running the database steps here'));
    expect(l.log).toHaveBeenCalledWith('[startup] The database steps finished.');
    expect(STARTUP_TIMEOUT_MS).toBeLessThan(300_000); // inside the host's health-check window
  });

  it('reports a failure, a timeout or a crash loudly, but never throws, so the server still starts and the Control center can show the problem', async () => {
    for (const result of [{ code: 1, timedOut: false }, { code: null, timedOut: true }]) {
      const l = logger();
      expect(await runStartupTasks(RAILWAY, jest.fn().mockResolvedValue(result), '/repo', l)).toBe('failed');
      expect(l.error).toHaveBeenCalledWith(expect.stringContaining('Starting the API anyway'));
    }
    const l = logger();
    expect(await runStartupTasks(RAILWAY, jest.fn().mockRejectedValue(new Error('no shell')), '/repo', l)).toBe('failed');
    expect(l.error).toHaveBeenCalledWith(expect.stringContaining('could not be run: no shell'));
  });

  it('finds the script from where the code lives, in the source tree and (by the same depth) in the built one', async () => {
    const run = jest.fn().mockResolvedValue({ code: 0, timedOut: false });
    await runStartupTasks(RAILWAY, run, undefined, logger());
    const script = run.mock.calls[0][0] as string;
    expect(path.basename(script)).toBe('prepare.sh');
    expect(fs.existsSync(script)).toBe(true);
  });
});
