import { computed, inject, Injectable, signal } from '@angular/core';
import { AppError } from '../../core/errors/app-error';
import {
  CorrectionRequest,
  CorrectionRequestChange,
  CorrectionRequestRealtimeStatus,
  CorrectionRequestReceipt,
  CorrectionRequestStatus,
  CreateCorrectionRequestInput,
  RejectCorrectionRequestInput,
  ResolveCorrectionRequestInput,
  ResolveEditLoanRequestInput,
} from '../../core/models/correction-request.model';
import { UserRole } from '../../core/models/profile.model';
import { CORRECTION_REQUEST_REPOSITORY } from '../../core/repositories/correction-request.repository';

@Injectable()
export class CorrectionRequestsStore {
  private readonly repository = inject(CORRECTION_REQUEST_REPOSITORY);

  readonly requests = signal<CorrectionRequest[]>([]);
  readonly notificationRequests = signal<CorrectionRequest[]>([]);
  readonly myRequests = signal<CorrectionRequest[]>([]);
  readonly pendingCount = signal(0);
  readonly unreadCount = signal(0);
  readonly realtimeConnected = signal(false);
  readonly lastChange = signal<CorrectionRequestChange | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly recentPending = computed(() =>
    this.notificationRequests()
      .filter((request) => request.status === 'pending')
      .slice(0, 5),
  );
  readonly recentMine = computed(() => this.myRequests().slice(0, 5));

  private notificationRole: UserRole | null = null;
  private notificationUserId: string | null = null;
  private unsubscribeFromChanges: (() => void) | null = null;

  async initializeNotifications(userId: string, role: UserRole): Promise<void> {
    this.disconnectNotifications();
    this.notificationRole = role;
    this.notificationUserId = userId;

    let initialSyncCompleted = false;
    this.unsubscribeFromChanges = this.repository.subscribe(
      { userId, role },
      (change) => void this.handleRealtimeChange(change),
      (status) => {
        this.handleRealtimeStatus(status);
        if (status === 'SUBSCRIBED' && initialSyncCompleted) {
          void this.reconcileNotifications();
        }
      },
    );

    await this.reconcileNotifications();
    initialSyncCompleted = true;
  }

  disconnectNotifications(): void {
    this.unsubscribeFromChanges?.();
    this.unsubscribeFromChanges = null;
    this.realtimeConnected.set(false);
  }

  async reconcileNotifications(): Promise<void> {
    if (this.notificationRole === 'collector') {
      await Promise.all([this.loadMine(), this.refreshMineUnreadCount()]);
      return;
    }

    if (this.notificationRole === 'admin' || this.notificationRole === 'supervisor') {
      await Promise.all([this.loadRecentPending(), this.refreshPendingCount()]);
    }
  }

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

  async loadMine(limit = 10): Promise<void> {
    try {
      this.myRequests.set(await this.repository.listMine(limit));
    } catch (error) {
      this.error.set(this.messageFrom(error, 'No se pudieron cargar tus solicitudes.'));
    }
  }

  async refreshMineUnreadCount(): Promise<void> {
    try {
      this.unreadCount.set(await this.repository.countMineUnread());
    } catch (error) {
      this.error.set(this.messageFrom(error, 'No se pudo actualizar el contador de notificaciones.'));
    }
  }

  async markMineRead(): Promise<void> {
    if (this.notificationRole !== 'collector' || this.unreadCount() === 0) return;

    try {
      await this.repository.markMineRead();
      const readAt = new Date().toISOString();
      this.myRequests.update((requests) =>
        requests.map((request) =>
          request.status !== 'pending' && request.readAt === null
            ? { ...request, readAt }
            : request,
        ),
      );
      this.unreadCount.set(0);
    } catch (error) {
      this.error.set(this.messageFrom(error, 'No se pudieron marcar las notificaciones como leídas.'));
    }
  }

  async openNotificationInbox(): Promise<void> {
    if (this.notificationRole === 'collector') {
      await this.loadMine();
      await this.markMineRead();
      return;
    }

    await this.loadRecentPending();
  }

  async create(input: CreateCorrectionRequestInput): Promise<CorrectionRequestReceipt | null> {
    const receipt = await this.runMutation(
      () => this.repository.create(input),
      'No se pudo enviar la solicitud.',
      false,
    );

    if (receipt && this.notificationRole === 'collector') {
      await this.loadMine();
    }

    return receipt;
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

  private async handleRealtimeChange(change: CorrectionRequestChange): Promise<void> {
    if (
      this.notificationRole !== 'collector' &&
      change.eventType === 'UPDATE' &&
      change.handledBy === this.notificationUserId
    ) {
      return;
    }

    this.lastChange.set(change);

    if (this.notificationRole === 'collector') {
      if (change.requestedBy !== this.notificationUserId || change.eventType !== 'UPDATE') return;
      await Promise.all([this.loadMine(), this.refreshMineUnreadCount()]);
      return;
    }

    await Promise.all([this.loadRecentPending(), this.refreshPendingCount()]);
  }

  private handleRealtimeStatus(status: CorrectionRequestRealtimeStatus): void {
    this.realtimeConnected.set(status === 'SUBSCRIBED');
  }

  private messageFrom(error: unknown, fallback: string): string {
    return AppError.from(error).message || fallback;
  }
}
