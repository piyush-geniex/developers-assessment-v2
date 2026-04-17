import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

@Catch()
export class EnvelopeExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest();
    const res = ctx.getResponse();

    const requestId = String((req as any).requestId ?? '');
    const timestamp = new Date().toISOString();

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const response = exception.getResponse();
      return res.status(statusCode).json({
        data: response,
        meta: { timestamp, request_id: requestId },
      });
    }

    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      data: {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
      },
      meta: { timestamp, request_id: requestId },
    });
  }
}
