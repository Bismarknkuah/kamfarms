import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import * as express from 'express';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  app.use(helmet());
  // NestJS's default body size limit (inherited from Express, 100kb)
  // was never raised anywhere in this project - a real, confirmed gap
  // that would silently reject any base64 data-URI payload larger than
  // that, including a typical phone photo (often several MB) for the
  // new expense-attachment feature, and likely already affecting
  // longer voice note recordings too. 10mb covers a realistic photo
  // with base64's ~33% size overhead, without leaving the limit
  // effectively unbounded.
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));
  // Origins are checked two ways. Exact matches come from WEB_ORIGIN as
  // before (comma-separated). On top of that, any Vercel *preview*
  // deployment of this project is accepted - Vercel mints a unique
  // hostname for every single push (kamfarms-<hash>-<team>.vercel.app),
  // so listing them by hand is impossible and each one was being
  // rejected with a CORS error at the login screen. The pattern is
  // deliberately narrow: only hostnames that start with the project
  // name and end in .vercel.app, never a wildcard. WEB_ORIGIN_PATTERN
  // can override the regex if the project is ever renamed.
  const exactOrigins = process.env.WEB_ORIGIN?.split(',').map((o) => o.trim()).filter(Boolean) ?? ['http://localhost:3000'];
  const previewPattern = new RegExp(process.env.WEB_ORIGIN_PATTERN ?? '^https://kamfarms[a-z0-9-]*\\.vercel\\.app$');
  app.enableCors({
    origin: (origin, callback) => {
      // Same-origin / server-to-server requests carry no Origin header.
      if (!origin) return callback(null, true);
      if (exactOrigins.includes(origin) || previewPattern.test(origin)) return callback(null, true);
      return callback(new Error(`Origin ${origin} is not allowed by CORS`), false);
    },
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new TransformInterceptor());
  app.setGlobalPrefix('api');

  const swaggerConfig = new DocumentBuilder()
    .setTitle('KAM-ROMS API')
    .setDescription('KAM Rice Operations Management System - REST API')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`KAM-ROMS API listening on :${port} - docs at /api/docs`);
}

bootstrap();
