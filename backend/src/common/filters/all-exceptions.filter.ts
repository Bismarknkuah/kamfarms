import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { humanizeValidationMessages } from './humanize-validation';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'An unexpected error occurred.';
    let errorCode = 'INTERNAL_ERROR';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (typeof body === 'object' && body !== null) {
        const b = body as Record<string, unknown>;
        message = Array.isArray(b.message) ? humanizeValidationMessages(b.message).join('; ') : ((b.message as string) ?? message);
        errorCode = (b.errorCode as string) ?? this.codeFromStatus(status);
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError || exception instanceof Prisma.PrismaClientInitializationError) {
      // A database failure used to surface as "An unexpected error occurred" with no hint of the cause. Say what it is
      // (in words a person can act on); the full error still goes to the log. Names of tables are shown, nothing else.
      const mapped = this.fromDatabase(exception);
      if (mapped) ({ status, message, errorCode } = mapped);
      this.logger.error(`Database error ${(exception instanceof Prisma.PrismaClientKnownRequestError ? exception.code : exception.errorCode) ?? ''} on ${request.method} ${request.url}`, exception.stack);
    } else {
      // Never leak internal stack traces to clients.
      this.logger.error(
        `Unhandled exception on ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json({
      success: false,
      message,
      errorCode,
      data: null,
    });
  }

  private fromDatabase(e: Prisma.PrismaClientKnownRequestError | Prisma.PrismaClientInitializationError): { status: number; message: string; errorCode: string } | null {
    const code = e instanceof Prisma.PrismaClientKnownRequestError ? e.code : e.errorCode;
    const meta = (e instanceof Prisma.PrismaClientKnownRequestError ? e.meta : undefined) as Record<string, unknown> | undefined;
    const name = (v: unknown) => (typeof v === 'string' ? v.replace(/^public\./, '') : '');
    switch (code) {
      case 'P2021':
      case 'P2022': {
        const what = code === 'P2021' ? name(meta?.table) : name(meta?.column);
        return {
          status: HttpStatus.SERVICE_UNAVAILABLE,
          errorCode: 'DATABASE_NEEDS_UPDATE',
          message: `The database is missing ${code === 'P2021' ? 'a table' : 'a column'} this version of the system needs${what ? ` (${what})` : ''}. The server creates these when it starts, so the last start-up probably did not finish. Ask the System Administrator to open the Control center and check the database, or to read the server's start-up log.`,
        };
      }
      case 'P1001':
      case 'P1002':
      case 'P1008':
      case 'P1017':
        return { status: HttpStatus.SERVICE_UNAVAILABLE, errorCode: 'DATABASE_UNREACHABLE', message: 'The database did not answer. Please wait a minute and try again.' };
      case 'P2002':
        return { status: HttpStatus.CONFLICT, errorCode: 'CONFLICT', message: 'That already exists.' };
      case 'P2025':
        return { status: HttpStatus.NOT_FOUND, errorCode: 'NOT_FOUND', message: 'That record no longer exists.' };
      default:
        return null;
    }
  }

  private codeFromStatus(status: number): string {
    switch (status) {
      case HttpStatus.UNAUTHORIZED:
        return 'UNAUTHORIZED';
      case HttpStatus.FORBIDDEN:
        return 'FORBIDDEN';
      case HttpStatus.NOT_FOUND:
        return 'NOT_FOUND';
      case HttpStatus.CONFLICT:
        return 'CONFLICT';
      case HttpStatus.BAD_REQUEST:
        return 'BAD_REQUEST';
      default:
        return 'INTERNAL_ERROR';
    }
  }
}
