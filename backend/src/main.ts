import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp, setupDocs } from './app.setup';
import { runStartupTasks } from './startup/startup-tasks';

async function bootstrap() {
  // Normally docker/start.sh has already prepared the database. If the server was started without it (an old start command
  // in the Railway dashboard, say), do it here first, so the tables and permissions it needs exist.
  await runStartupTasks();

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  configureApp(app);
  setupDocs(app);

  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`KAM-ROMS API listening on :${port} - docs at /api/docs`);
}

bootstrap().catch((err) => {
  // A start-up failure must say so in the log, plainly, and stop: the host then restarts it or keeps the old version.
  // eslint-disable-next-line no-console
  console.error('[startup] The API failed to start:', err);
  process.exit(1);
});
