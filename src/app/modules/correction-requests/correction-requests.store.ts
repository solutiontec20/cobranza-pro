import { computed, inject, Injectable, signal } from '@angular/core';
import { AppError } from '../../core/errors/app-error';
import {
  CorrectionRequest,
  CorrectionRequestReceipt,
  CorrectionRequestStatus,
  CreateCorrectionRequestInput,
  RejectCorrectionRequestInput,
  ResolveCorrectionRequestInput,
  ResolveEditLoanRequestInput,
} from '../../core/models/correction-request.model';
import { CORRECTION_REQUEST_REPOSITORY } from '../../core/repositories/correction-request.repository';

@Injectable()
export class CorrectionRequestsStore {
  private readonly repository = inject(CORRECTION_REQUEST_REPOSITORY);

  readonly requests = signal<CorrectionRequest[]>([]);
  readonly notificationRequests = signal<CorrectionRequest[]>([]);
  readonly pendingCount = signal(0);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly recentPending = computed(() =>
    this.notificationRequests()
      .filter((request) => request.status === 'pending')
      .slice(0, 5),
  );

  async load(status: CorrectionRequestStatus | null = null, limit = 100): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      this.requests.set(await this.repository.list(status, limit));
    } catch (error) {
      this.error.set(this.messageFrom(error, 'No se pudieron cargar las solicitudes.'));
    } finally {
      this.loading.set(false);
    }
  }

  async refreshPendingCount(): Promise<void> {
    try {
      this.pendingCount.set(await this.repository.countPending());
    } catch (error) {
      this.error.set(this.messageFrom(error, 'No se pudo actualizar el contador de solicitudes.'));
    }
  }

  async loadRecentPending(limit = 5): Promise<void> {
    try {
      this.notificationRequests.set(await this.repository.list('pending', limit));
    } catch (error) {
      this.error.set(this.messageFrom(error, 'No se pudieron cargar las notificaciones.'));
    }
  }

  async create(input: CreateCorrectionRequestInput): Promise<CorrectionRequestReceipt | null> {
    return this.runMutation(
      () => this.repository.create(input),
      'No se pudo enviar la solicitud.',
      false,
    );
  }

  async reject(input: RejectCorrectionRequestInput): Promise<boolean> {
    return (
      (await this.runMutation(
        () => this.repository.reject(input),
        'No se pudo rechazar la solicitud.',
      )) !== null
    );
  }

  async resolveEdit(input: ResolveEditLoanRequestInput): Promise<boolean> {
    return (
      (await this.runMutation(
        () => this.repository.resolveEdit(input),
        'No se pudo aplicar la edición solicitada.',
      )) !== null
    );
  }

  async resolveVoidLoan(input: ResolveCorrectionRequestInput): Promise<boolean> {
    return (
      (await this.runMutation(
        () => this.repository.resolveVoidLoan(input),
        'No se pudo anular el préstamo.',
      )) !== null
    );
  }

  async resolveVoidPayment(input: ResolveCorrectionRequestInput): Promise<boolean> {
    return (
      (await this.runMutation(
        () => this.repository.resolveVoidPayment(input),
        'No se pudo anular el pago.',
      )) !== null
    );
  }

  clearError(): void {
    this.error.set(null);
  }

  private async runMutation<T>(
    action: () => Promise<T>,
    fallbackMessage: string,
    refresh = true,
  ): Promise<T | null> {
    this.saving.set(true);
    this.error.set(null);

    try {
      const result = await action();
      if (refresh) {
        await Promise.all([this.load(), this.loadRecentPending(), this.refreshPendingCount()]);
      }
      return result;
    } catch (error) {
      this.error.set(this.messageFrom(error, fallbackMessage));
      return null;
    } finally {
      this.saving.set(false);
    }
  }

  private messageFrom(error: unknown, fallback: string): string {
    return AppError.from(error).message || fallback;
  }
}
