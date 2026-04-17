export function successResponse<T>(data: T) {
  return {
    data,
    meta: {
      timestamp: new Date().toISOString(),
    },
  };
}
export function errorResponse(error: unknown) {
  let message = 'Internal Server Error';

  if (error instanceof Error) {
    message = error.message;
  }

  return {
    data: null,
    meta: {
      timestamp: new Date().toISOString(),
      error: message,
    },
  };
}
