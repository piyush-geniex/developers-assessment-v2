import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';

type Envelope<T> = {
  data: T;
  meta: { timestamp: string; request_id: string };
};

@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((body) => {
        if (
          body &&
          typeof body === 'object' &&
          'data' in body &&
          'meta' in body
        ) {
          return body;
        }

        const req = context.switchToHttp().getRequest();
        const requestId = String((req as any).requestId ?? '');

        const envelope: Envelope<any> = {
          data: body,
          meta: { timestamp: new Date().toISOString(), request_id: requestId },
        };

        return envelope;
      }),
    );
  }
}
