import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { v4 as uuid } from 'uuid';

export interface ResponseEnvelope<T> {
  data: T;
  meta: {
    timestamp: string;
    request_id: string;
  };
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ResponseEnvelope<T>> {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ResponseEnvelope<T>> {
    const requestId = uuid();
    const timestamp = new Date().toISOString();

    return next.handle().pipe(
      map((data) => ({
        data,
        meta: {
          timestamp,
          request_id: requestId,
        },
      })),
    );
  }
}
