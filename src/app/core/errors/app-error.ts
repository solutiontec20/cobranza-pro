export type AppErrorCode =
  | 'AUTH_INVALID_CREDENTIALS'
  | 'AUTH_SESSION_EXPIRED'
  | 'AUTH_UNAUTHORIZED'
  | 'SUPABASE_CONNECTION'
  | 'SUPABASE_RLS'
  | 'SUPABASE_RPC'
  | 'VALIDATION'
  | 'NETWORK'
  | 'UNKNOWN';

export class AppError extends Error {
  constructor(
    readonly code: AppErrorCode,
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }

  static from(error: unknown, code: AppErrorCode = 'UNKNOWN'): AppError {
    if (error instanceof AppError) {
      return error;
    }

    if (error instanceof Error) {
      return new AppError(code, error.message, error);
    }

    return new AppError(code, String(error), error);
  }
}
