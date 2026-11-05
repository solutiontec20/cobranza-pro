import { DOCUMENT } from '@angular/common';
import { Component, computed, effect, inject, OnDestroy, OnInit, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { Popover, PopoverModule } from 'primeng/popover';
import { ThemeService } from '../../core/services/theme.service';
import { CorrectionRequest, CorrectionRequestType } from '../../core/models/correction-request.model';
import { AuthService } from '../../modules/auth/auth.service';
import { CorrectionRequestsStore } from '../../modules/correction-requests/correction-requests.store';
import { EsDate } from '../../shared/pipes/es-date';

@Component({
  selector: 'app-topbar',
  imports: [RouterLink, ButtonModule, PopoverModule, EsDate],
  templateUrl: './topbar.html',
})
export class Topbar implements OnInit, OnDestroy {
  protected readonly themeService = inject(ThemeService);
  protected readonly authService = inject(AuthService);
  protected readonly correctionRequestsStore = inject(CorrectionRequestsStore);
  private readonly document = inject(DOCUMENT);
  private readonly messageService = inject(MessageService);
  private readonly notificationPopover = viewChild<Popover>('notificationPopover');
  private readonly refreshWhenVisible = () => {
    if (this.document.visibilityState === 'visible') {
      void this.correctionRequestsStore.reconcileNotifications();
    }
  };

  protected readonly notificationCount = computed(() =>
    this.authService.isCollector()
      ? this.correctionRequestsStore.unreadCount()
      : this.correctionRequestsStore.pendingCount(),
  );
  protected readonly notifications = computed(() =>
    this.authService.isCollector()
      ? this.correctionRequestsStore.recentMine()
      : this.correctionRequestsStore.recentPending(),
  );
  protected readonly notificationHeading = computed(() =>
    this.authService.isCollector() ? 'Mis solicitudes' : 'Solicitudes pendientes',
  );
  protected readonly notificationDescription = computed(() =>
    this.authService.isCollector()
      ? `${this.correctionRequestsStore.unreadCount()} respuestas sin leer`
      : `${this.correctionRequestsStore.pendingCount()} por revisar`,
  );

  constructor() {
    effect(() => {
      const change = this.correctionRequestsStore.lastChange();
      if (!change) return;

      if (!this.authService.isCollector() && change.eventType === 'INSERT') {
        this.messageService.add({
          severity: 'info',
          summary: 'Nueva solicitud',
          detail: 'Un cobrador envió una solicitud de corrección.',
          life: 5000,
        });
        return;
      }

      if (this.authService.isCollector() && change.eventType === 'UPDATE') {
        const approved = change.status === 'resolved';
        this.messageService.add({
          severity: approved ? 'success' : 'warn',
          summary: approved ? 'Solicitud aprobada' : 'Solicitud rechazada',
          detail:
            change.resolutionNote ??
            (approved
              ? 'La solicitud fue procesada correctamente.'
              : 'La solicitud fue rechazada.'),
          life: 6000,
        });
      }
    });
  }

  ngOnInit(): void {
    const profile = this.authService.currentUser();
    if (!profile || !this.canUseNotifications()) return;

    void this.correctionRequestsStore.initializeNotifications(profile.id, profile.role);
    this.document.addEventListener('visibilitychange', this.refreshWhenVisible);
  }

  ngOnDestroy(): void {
    this.document.removeEventListener('visibilitychange', this.refreshWhenVisible);
    this.correctionRequestsStore.disconnectNotifications();
  }

  protected canUseNotifications(): boolean {
    return !this.authService.mustChangePin() && this.authService.isAuthenticated();
  }

  protected openNotifications(event: Event): void {
    void this.correctionRequestsStore.openNotificationInbox();
    this.notificationPopover()?.toggle(event);
  }

  protected notificationLink(request: CorrectionRequest): string[] {
    return this.authService.isCollector()
      ? ['/cobrador/cliente', request.customerId]
      : ['/admin/solicitudes'];
  }

  protected requestTypeLabel(type: CorrectionRequestType): string {
    return {
      edit_loan: 'Edición de préstamo',
      void_loan: 'Anulación de préstamo',
      void_payment: 'Anulación de pago',
    }[type];
  }

  protected statusLabel(request: CorrectionRequest): string {
    return {
      pending: 'Pendiente',
      resolved: 'Aprobada',
      rejected: 'Rechazada',
    }[request.status];
  }
}
