import { spawn } from 'child_process';
import * as path from 'path';

/**
 * The database steps (create missing tables, bring permissions up to date) normally run in docker/start.sh before the API
 * starts. If the API finds it was started WITHOUT them, for example because an old start command is still set in the Railway
 * dashboard (which overrides the image's), it runs the same script itself, so the system never sits on a database that is
 * missing tables and permissions. Only on Railway, and only when the script has not already run.
 */
export interface StartupDecision { run: boolean; reason: string }
export type Runner = (script: string, cwd: string, timeoutMs: number) => Promise<{ code: number | null; timedOut: boolean }>;

/** Longer than the steps normally take, shorter than the host's health-check window, so a hang cannot hold the server back for ever. */
export const STARTUP_TIMEOUT_MS = 240_000;

export function shouldRunStartupTasks(env: NodeJS.ProcessEnv): StartupDecision {
  if (env.STARTUP_TASKS === 'off') return { run: false, reason: 'switched off (STARTUP_TASKS=off)' };
  if (env.STARTUP_TASKS_DONE === '1') return { run: false, reason: 'already done by docker/start.sh' };
  const onRailway = Boolean(env.RAILWAY_ENVIRONMENT_NAME || env.RAILWAY_ENVIRONMENT || env.RAILWAY_PROJECT_ID || env.RAILWAY_SERVICE_ID);
  if (!onRailway && env.STARTUP_TASKS !== 'on') return { run: false, reason: 'not running on Railway' };
  return { run: true, reason: 'the server was started without the database steps' };
}

export const spawnScript: Runner = (script, cwd, timeoutMs) =>
  new Promise((resolve) => {
    let timedOut = false;
    const child = spawn('sh', [script], { cwd, stdio: 'inherit', env: process.env });
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutMs);
    child.on('exit', (code) => { clearTimeout(timer); resolve({ code, timedOut }); });
    child.on('error', () => { clearTimeout(timer); resolve({ code: null, timedOut }); });
  });

export interface Logger { log: (m: string) => void; error: (m: string) => void }

/** Never throws: a failure is logged loudly and the server still starts, so the Control center can show what is wrong. */
export async function runStartupTasks(
  env: NodeJS.ProcessEnv = process.env,
  run: Runner = spawnScript,
  root: string = path.resolve(__dirname, '../../..'),
  logger: Logger = console,
): Promise<'skipped' | 'done' | 'failed'> {
  const decision = shouldRunStartupTasks(env);
  if (!decision.run) return 'skipped';
  logger.log(`[startup] Running the database steps here: ${decision.reason}.`);
  try {
    const { code, timedOut } = await run(path.join(root, 'docker', 'prepare.sh'), root, STARTUP_TIMEOUT_MS);
    if (code === 0) { logger.log('[startup] The database steps finished.'); return 'done'; }
    logger.error(timedOut ? `[startup] The database steps did not finish within ${STARTUP_TIMEOUT_MS / 1000} seconds. Starting the API anyway.` : `[startup] The database steps failed (exit code ${code}). Starting the API anyway. Read the lines above.`);
    return 'failed';
  } catch (err) {
    logger.error(`[startup] The database steps could not be run: ${(err as Error).message}. Starting the API anyway.`);
    return 'failed';
  }
}
