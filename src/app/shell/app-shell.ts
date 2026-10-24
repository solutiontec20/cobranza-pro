import { Component, ElementRef, inject, OnDestroy, OnInit, signal, viewChild } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AvatarModule } from 'primeng/avatar';
import { ButtonModule } from 'primeng/button';
import { SidebarModule } from 'primeng/sidebar';
import { ToastModule } from 'primeng/toast';
import { AuthService } from '../modules/auth/auth.service';
import { Topbar } from './topbar/topbar';

@Component({
  selector: 'app-shell',
  imports: [
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    Topbar,
    ToastModule,
    SidebarModule,
    AvatarModule,
    ButtonModule,
  ],
  template: `
    <p-toast />
    <div
      class="app-shell flex h-dvh w-full overflow-hidden font-sans text-surface-900 dark:text-surface-0"
      [class.app-mobile-nav-open]="isMobile() && open()"
    >
      <div class="app-shell-frame relative flex h-full min-h-0 w-full flex-col overflow-hidden">
        <p-sidebar-layout class="app-sidebar-layout relative! h-full! min-h-0! flex-1">
          @if (isMobile() && open()) {
            <p-sidebar-backdrop class="absolute!" />
          }
          <p-sidebar
            id="primary-navigation"
            [collapsible]="isMobile() ? 'offcanvas' : 'icon'"
            [overlay]="isMobile()"
            [(open)]="open"
            (openChange)="handleNavigationChange($event)"
          >
            <p-sidebar-spacer />
            <p-sidebar-aside
              [attr.role]="isMobile() ? 'dialog' : 'navigation'"
              [attr.aria-modal]="isMobile() ? 'true' : null"
              aria-label="Navegación principal"
            >
              <p-sidebar-panel>
                <p-sidebar-header>
                  <p-sidebar-menu>
                    <p-sidebar-menu-item>
                      <div class="app-sidebar-brand flex min-w-0 items-center justify-between p-1!">
                        <div class="flex min-w-0 items-center gap-3">
                          <div class="app-brand-mark">
                            <i class="pi pi-wallet" aria-hidden="true"></i>
                          </div>
                          <span class="truncate text-base font-extrabold tracking-tight text-primary">
                            CobranzaPro
                          </span>
                        </div>
                        <button
                          #mobileCloseButton
                          pButton
                          type="button"
                          [text]="true"
                          [rounded]="true"
                          class="app-sidebar-close flex size-11 shrink-0 items-center justify-center p-0 lg:hidden"
                          (click)="closeNavigation()"
                          aria-label="Cerrar navegación"
                        >
                          <i class="pi pi-times" aria-hidden="true"></i>
                        </button>
                      </div>
                    </p-sidebar-menu-item>
                  </p-sidebar-menu>
                </p-sidebar-header>

                <p-sidebar-content>
                  @if (authService.mustChangePin()) {
                    <p class="px-3 py-2 text-xs text-muted-color">
                      Cambiá el PIN temporal para habilitar tu acceso.
                    </p>
                  } @else if (authService.isCollector()) {
                    <p-sidebar-group>
                      <p-sidebar-group-label>Cobrador</p-sidebar-group-label>
                      <p-sidebar-group-content>
                        <p-sidebar-menu>
                          <p-sidebar-menu-item>
                            <a
                              pSidebarMenuButton
                              routerLink="/cobrador"
                              routerLinkActive
                              #collectorHome="routerLinkActive"
                              [routerLinkActiveOptions]="{ exact: true }"
                              [isActive]="collectorHome.isActive"
                              (click)="closeNavigation()"
                            >
                              <i class="pi pi-home" aria-hidden="true"></i>
                              <span>Cobranza de hoy</span>
                            </a>
                          </p-sidebar-menu-item>
                          <p-sidebar-menu-item>
                            <a
                              pSidebarMenuButton
                              routerLink="/cobrador/clientes"
                              routerLinkActive
                              #collectorClients="routerLinkActive"
                              [isActive]="collectorClients.isActive"
                              (click)="closeNavigation()"
                            >
                              <i class="pi pi-users" aria-hidden="true"></i>
                              <span>Mis clientes</span>
                            </a>
                          </p-sidebar-menu-item>
                        </p-sidebar-menu>
                      </p-sidebar-group-content>
                    </p-sidebar-group>
                  } @else {
                    <p-sidebar-group>
                      <p-sidebar-group-label>Administración</p-sidebar-group-label>
                      <p-sidebar-group-content>
                        <p-sidebar-menu>
                          <p-sidebar-menu-item>
                            <a pSidebarMenuButton routerLink="/admin/dashboard" routerLinkActive #adminHome="routerLinkActive" [isActive]="adminHome.isActive" (click)="closeNavigation()">
                              <i class="pi pi-chart-bar" aria-hidden="true"></i>
                              <span>Dashboard</span>
                            </a>
                          </p-sidebar-menu-item>
                          <p-sidebar-menu-item>
                            <a pSidebarMenuButton routerLink="/admin/clientes" routerLinkActive #adminClients="routerLinkActive" [isActive]="adminClients.isActive" (click)="closeNavigation()">
                              <i class="pi pi-users" aria-hidden="true"></i>
                              <span>Clientes</span>
                            </a>
                          </p-sidebar-menu-item>
                          <p-sidebar-menu-item>
                            <a pSidebarMenuButton routerLink="/admin/prestamos" routerLinkActive #adminLoans="routerLinkActive" [isActive]="adminLoans.isActive" (click)="closeNavigation()">
                              <i class="pi pi-wallet" aria-hidden="true"></i>
                              <span>Préstamos</span>
                            </a>
                          </p-sidebar-menu-item>
                          <p-sidebar-menu-item>
                            <a pSidebarMenuButton routerLink="/admin/cobradores" routerLinkActive #adminCollectors="routerLinkActive" [isActive]="adminCollectors.isActive" (click)="closeNavigation()">
                              <i class="pi pi-id-card" aria-hidden="true"></i>
                              <span>Cobradores</span>
                            </a>
                          </p-sidebar-menu-item>
                          <p-sidebar-menu-item>
                            <a pSidebarMenuButton routerLink="/admin/control-diario" routerLinkActive #adminDailyControl="routerLinkActive" [isActive]="adminDailyControl.isActive" (click)="closeNavigation()">
                              <i class="pi pi-file-excel" aria-hidden="true"></i>
                              <span>Control diario</span>
                            </a>
                          </p-sidebar-menu-item>
                          <p-sidebar-menu-item>
                            <a pSidebarMenuButton routerLink="/admin/auditoria" routerLinkActive #adminAudit="routerLinkActive" [isActive]="adminAudit.isActive" (click)="closeNavigation()">
                              <i class="pi pi-shield" aria-hidden="true"></i>
                              <span>Auditoría</span>
                            </a>
                          </p-sidebar-menu-item>
                        </p-sidebar-menu>
                      </p-sidebar-group-content>
                    </p-sidebar-group>
                  }

                  <p-sidebar-group>
                    <p-sidebar-group-label>Seguridad</p-sidebar-group-label>
                    <p-sidebar-group-content>
                      <p-sidebar-menu>
                        <p-sidebar-menu-item>
                          <a pSidebarMenuButton routerLink="/cambiar-pin" routerLinkActive #pinRoute="routerLinkActive" [isActive]="pinRoute.isActive" (click)="closeNavigation()">
                            <i class="pi pi-lock" aria-hidden="true"></i>
                            <span>Cambiar PIN</span>
                          </a>
                        </p-sidebar-menu-item>
                      </p-sidebar-menu>
                    </p-sidebar-group-content>
                  </p-sidebar-group>
                </p-sidebar-content>

                <p-sidebar-footer>
                  <div class="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5">
                    <div class="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                      <p-avatar
                        [label]="authService.currentUser()?.fullName?.charAt(0) || 'U'"
                        shape="circle"
                        class="size-8 shrink-0 bg-gradient-to-br from-indigo-500 to-purple-600 text-xs font-bold text-white"
                      />
                      <div class="flex min-w-0 flex-col">
                        <span class="truncate text-xs font-semibold text-surface-800 dark:text-surface-100">
                          {{ authService.currentUser()?.fullName || 'Usuario' }}
                        </span>
                        <span class="truncate text-[10px] capitalize text-surface-400">
                          {{ authService.currentUser()?.role || '' }}
                        </span>
                      </div>
                    </div>
                    <button
                      pButton
                      type="button"
                      [text]="true"
                      [rounded]="true"
                      severity="danger"
                      class="flex size-10 shrink-0 cursor-pointer items-center justify-center p-0"
                      (click)="authService.logout()"
                      title="Cerrar sesión"
                      aria-label="Cerrar sesión"
                    >
                      <i class="pi pi-sign-out text-base" aria-hidden="true"></i>
                    </button>
                  </div>
                </p-sidebar-footer>
              </p-sidebar-panel>
            </p-sidebar-aside>
          </p-sidebar>

          <p-sidebar-main class="app-workspace">
            <header class="app-topbar flex shrink-0 items-center gap-2 px-3 sm:px-4">
              <button
                #navigationButton
                pButton
                type="button"
                class="app-menu-button flex size-11 items-center justify-center rounded-lg bg-transparent p-0"
                (click)="toggleNavigation()"
                [attr.aria-label]="open() ? 'Cerrar navegación' : 'Abrir navegación'"
                [attr.aria-expanded]="open()"
                aria-controls="primary-navigation"
              >
                <i class="pi pi-bars text-lg" aria-hidden="true"></i>
              </button>
              <div class="min-w-0 flex-1">
                <app-topbar />
              </div>
            </header>

            <main id="main-content" class="app-content p-3 sm:p-5 lg:p-7">
              <router-outlet />
            </main>
          </p-sidebar-main>
        </p-sidebar-layout>
      </div>
    </div>
  `,
})
export default class AppShell implements OnInit, OnDestroy {
  readonly authService = inject(AuthService);
  readonly isMobile = signal(false);
  readonly open = signal(true);
  private readonly navigationButton = viewChild<ElementRef<HTMLButtonElement>>('navigationButton');
  private readonly mobileCloseButton = viewChild<ElementRef<HTMLButtonElement>>('mobileCloseButton');

  private mql?: MediaQueryList;
  private mqlListener?: (event: MediaQueryListEvent) => void;

  ngOnInit(): void {
    if (typeof window === 'undefined') return;

    this.mql = window.matchMedia('(max-width: 1023px)');
    this.applyViewport(this.mql.matches);
    this.mqlListener = (event) => this.applyViewport(event.matches);
    this.mql.addEventListener('change', this.mqlListener);
  }

  ngOnDestroy(): void {
    if (this.mqlListener) {
      this.mql?.removeEventListener('change', this.mqlListener);
    }
  }

  closeNavigation(): void {
    if (this.isMobile()) {
      this.open.set(false);
      queueMicrotask(() => this.navigationButton()?.nativeElement.focus());
    }
  }

  toggleNavigation(): void {
    const willOpen = !this.open();
    this.open.set(willOpen);

    if (willOpen && this.isMobile()) {
      queueMicrotask(() => this.mobileCloseButton()?.nativeElement.focus());
    }
  }

  handleNavigationChange(isOpen: boolean): void {
    this.open.set(isOpen);
    if (!isOpen && this.isMobile()) {
      queueMicrotask(() => this.navigationButton()?.nativeElement.focus());
    }
  }

  private applyViewport(isMobile: boolean): void {
    this.isMobile.set(isMobile);
    this.open.set(!isMobile);
  }
}
