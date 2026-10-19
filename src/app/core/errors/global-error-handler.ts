import { ErrorHandler, inject } from '@angular/core';
import { ToastService } from '../services/toast.service';
import { AppError, AppErrorCode } from './app-error';

const USER_MESSAGES: Record<AppErrorCode, string> = {
  AUTH_INVALID_CREDENTIALS: 'DNI o PIN incorrectos.',
  AUTH_SESSION_EXPIRED: 'Tu sesión expiró. Ingresa de nuevo.',
  AUTH_UNAUTHORIZED: 'No tienes permiso para esta acción.',
  SUPABASE_CONNECTION: 'No se pudo conectar al servidor. Intenta de nuevo.',
  SUPABASE_RLS: 'No tienes acceso a este recurso.',
  SUPABASE_RPC: 'Ocurrió un error al procesar la operación.',
  VALIDATION: 'Datos inválidos. Revisa el formulario.',
  NETWORK: 'Sin conexión a internet.',
  UNKNOWN: 'Ocurrió un error inesperado.',
};

export class GlobalErrorHandler implements ErrorHandler {
  private toast = inject(ToastService);

  handleError(error: unknown): void {
    const appError = this.normalize(error);

    console.error(`[${appError.code}] ${appError.message}`, appError.cause ?? '');

    this.toast.error(USER_MESSAGES[appError.code]);
  }

  private normalize(error: unknown): AppError {
    if (error instanceof AppError) {
      return error;
    }

    const unwrapped = this.unwrap(error);

    if (unwrapped instanceof AppError) {
      return unwrapped;
    }

    if (this.isNetworkError(unwrapped)) {
      return new AppError('NETWORK', 'Network request failed', unwrapped);
    }

    return AppError.from(unwrapped);
  }

  private unwrap(error: unknown): unknown {
    if (error != null && typeof error === 'object' && 'rejection' in error) {
      return (error as { rejection: unknown }).rejection;
    }
    return error;
  }

  private isNetworkError(error: unknown): boolean {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return true;
    }
    if (error instanceof DOMException && error.name === 'AbortError') {
      return true;
    }
    return false;
  }
}
