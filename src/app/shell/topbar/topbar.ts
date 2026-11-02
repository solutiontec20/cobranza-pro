import { Component, inject, OnDestroy, OnInit, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { Popover, PopoverModule } from 'primeng/popover';
import { ThemeService } from '../../core/services/theme.service';
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
  private readonly notificationPopover = viewChild<Popover>('notificationPopover');
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    if (!this.canReviewRequests()) return;

    void this.correctionRequestsStore.refreshPendingCount();
    this.refreshTimer = setInterval(
      () => void this.correctionRequestsStore.refreshPendingCount(),
      30_000,
    );
  }

  ngOnDestroy(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
  }

  protected canReviewRequests(): boolean {
    return this.authService.isAdmin() || this.authService.isSupervisor();
  }

  protected openNotifications(event: Event): void {
    void this.correctionRequestsStore.loadRecentPending();
    this.notificationPopover()?.toggle(event);
  }
}
