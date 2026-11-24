
import {
  Component,
  ElementRef,
  inject,
  OnDestroy,
  OnInit,
  signal,
  viewChild
} from '@angular/core';
import {
  RouterLink,
  RouterLinkActive,
  RouterOutlet
} from '@angular/router';
import { ToastModule } from 'primeng/toast';

import { AccessControlService } from '../core/services/access-control.service';
import { AuthService } from '../modules/auth/auth.service';
import { CorrectionRequestsStore } from '../modules/correction-requests/correction-requests.store';
import { Topbar } from './topbar/topbar';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    Topbar,
    ToastModule
  ],
  styleUrls: ['./app-shell.css'],
  template: `
    <p-toast />

    <div
      class="app-shell"
      [class.app-shell--collapsed]="!isMobile() && !open()"
      [class.app-shell--mobile-open]="isMobile() && open()"
    >

      <!-- BACKDROP MOBILE -->
      @if (isMobile() && open()) {
        <div
          class="app-sidebar-backdrop"
          aria-hidden="true"
          (click)="closeNavigation()"
        ></div>
      }

      <!-- SIDEBAR -->
      <aside
        id="primary-navigation"
        class="app-sidebar"
        [attr.role]="isMobile() && open() ? 'dialog' : 'navigation'"
        [attr.aria-modal]="isMobile() && open() ? 'true' : null"
        aria-label="Navegación principal"
        [attr.aria-hidden]="isMobile() && !open() ? 'true' : null"
        [attr.inert]="isMobile() && !open() ? '' : null"
        (keydown)="onSidebarKeydown($event)"
      >

        <!-- HEADER Y LOGOTIPO -->
        <div class="app-sidebar-header">

          <div class="app-brand">

            <img
              class="app-brand-horizontal app-brand-light"
              src="/cobranzapro-quipu-horizontal-claro.svg"
              alt="CobranzaPro"
            />

            <img
              class="app-brand-horizontal app-brand-dark"
              src="/cobranzapro-quipu-horizontal-oscuro.svg"
              alt="CobranzaPro"
            />

            <img
              class="app-brand-icon app-brand-light"
              src="/cobranzapro-quipu-compacto-claro.svg"
              alt=""
            />

            <img
              class="app-brand-icon app-brand-dark"
              src="/cobranzapro-quipu-compacto-oscuro.svg"
              alt=""
            />

          </div>

          <button
            #mobileCloseButton
            type="button"
            class="app-icon-button app-sidebar-close"
            aria-label="Cerrar navegación"
            (click)="closeNavigation()"
          >
            <i class="pi pi-times" aria-hidden="true"></i>
          </button>

        </div>

        <!-- NAVEGACIÓN -->
        <nav
          class="app-sidebar-scroll"
          aria-label="Secciones de CobranzaPro"
        >

          @if (authService.mustChangePin()) {

            <p class="app-nav-notice">
              Cambiá el PIN temporal para habilitar tu acceso.
            </p>

          } @else if (authService.isCollector()) {

            <section class="app-nav-section">

              <h2 class="app-nav-heading">Cobrador</h2>

              <div class="app-nav-list">

                @for (item of collectorItems; track item.path) {

                  <a
                    class="app-nav-link"
                    [routerLink]="item.path"
                    routerLinkActive="is-active"
                    [routerLinkActiveOptions]="{ exact: true }"
                    ariaCurrentWhenActive="page"
                    [attr.title]="!isMobile() && !open() ? item.label : null"
                    (click)="closeNavigation()"
                  >
                    <i
                      [class]="item.icon"
                      aria-hidden="true"
                    ></i>

                    <span class="app-nav-label">
                      {{ item.label }}
                    </span>
                  </a>

                }

              </div>

            </section>

          } @else if (accessControl.ready()) {

            <section class="app-nav-section">

              <h2 class="app-nav-heading">
                Administración
              </h2>

              <div class="app-nav-list">

                @for (item of adminItems; track item.path) {

                  @if (accessControl.can(item.permission)) {

                    <a
                      class="app-nav-link"
                      [routerLink]="item.path"
                      routerLinkActive="is-active"
                      [routerLinkActiveOptions]="{ exact: true }"
                      ariaCurrentWhenActive="page"
                      [attr.title]="!isMobile() && !open() ? item.label : null"
                      (click)="closeNavigation()"
                    >

                      <i
                        [class]="item.icon"
                        aria-hidden="true"
                      ></i>

                      <span class="app-nav-label">
                        {{ item.label }}
                      </span>

                      @if (
                        item.path === '/admin/solicitudes' &&
                        correctionRequestsStore.pendingCount() > 0
                      ) {
                        <span
                          class="app-nav-badge"
                          [attr.aria-label]="
                            correctionRequestsStore.pendingCount() +
                            ' solicitudes pendientes'
                          "
                        >
                          {{ correctionRequestsStore.pendingCount() }}
                        </span>
                      }

                    </a>

                  }

                }

              </div>

            </section>

          }

          <!-- SEGURIDAD -->
          <section class="app-nav-section">

            <h2 class="app-nav-heading">
              Seguridad
            </h2>

            <div class="app-nav-list">

              <a
                class="app-nav-link"
                routerLink="/cambiar-pin"
                routerLinkActive="is-active"
                [routerLinkActiveOptions]="{ exact: true }"
                ariaCurrentWhenActive="page"
                [attr.title]="!isMobile() && !open() ? 'Cambiar PIN' : null"
                (click)="closeNavigation()"
              >
                <i class="pi pi-lock" aria-hidden="true"></i>

                <span class="app-nav-label">
                  Cambiar PIN
                </span>
              </a>

            </div>

          </section>

        </nav>

        <!-- FOOTER USUARIO -->
        <div class="app-sidebar-footer">

          <div
            class="app-user-avatar"
            aria-hidden="true"
          >
            {{
              (authService.currentUser()?.fullName || 'U')
                .charAt(0)
                .toUpperCase()
            }}
          </div>

          <div class="app-user-info">

            <span class="app-user-name">
              {{ authService.currentUser()?.fullName || 'Usuario' }}
            </span>

            <span class="app-user-role">
              {{ authService.currentUser()?.role || '' }}
            </span>

          </div>

          <button
            type="button"
            class="app-icon-button app-logout"
            (click)="authService.logout()"
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
          >
            <i class="pi pi-sign-out" aria-hidden="true"></i>
          </button>

        </div>

      </aside>

      <!-- AREA PRINCIPAL -->
      <div
        class="app-workspace"
        [attr.inert]="isMobile() && open() ? '' : null"
      >

        <!-- TOPBAR -->
        <header class="app-topbar">

          <!-- BOTÓN HAMBURGUESA -->
          <button
            #navigationButton
            type="button"
            class="app-icon-button app-menu-button"
            (click)="toggleNavigation()"
            [attr.aria-label]="
              isMobile()
                ? (open() ? 'Cerrar menú' : 'Abrir menú')
                : (open() ? 'Contraer menú' : 'Expandir menú')
            "
            [attr.aria-expanded]="open()"
            aria-controls="primary-navigation"
            title="Mostrar u ocultar menú"
          >
            <i class="pi pi-bars" aria-hidden="true"></i>
          </button>

          <div class="app-topbar-content">
            <app-topbar />
          </div>

        </header>

        <!-- CONTENIDO -->
        <main
          id="main-content"
          class="app-content"
        >
          <router-outlet />
        </main>

      </div>

    </div>
  `
})
export default class AppShell implements OnInit, OnDestroy {

  readonly authService = inject(AuthService);
  readonly accessControl = inject(AccessControlService);
  readonly correctionRequestsStore = inject(CorrectionRequestsStore);

  readonly isMobile = signal(false);
  readonly open = signal(true);

  // Navegación del cobrador
  readonly collectorItems = [
    {
      label: 'Cobranza de hoy',
      path: '/cobrador',
      icon: 'pi pi-home'
    },
    {
      label: 'Mis clientes',
      path: '/cobrador/clientes',
      icon: 'pi pi-users'
    },
    {
      label: 'Cierre de caja',
      path: '/cobrador/cierre-caja',
      icon: 'pi pi-calculator'
    }
  ] as const;

  // Navegación administrativa y permisos originales
  readonly adminItems = [
    {
      label: 'Dashboard',
      path: '/admin/dashboard',
      icon: 'pi pi-chart-bar',
      permission: 'dashboard.view'
    },
    {
      label: 'Analíticas',
      path: '/admin/analiticas',
      icon: 'pi pi-chart-line',
      permission: 'analytics.view'
    },
    {
      label: 'Clientes',
      path: '/admin/clientes',
      icon: 'pi pi-users',
      permission: 'clients.view'
    },
    {
      label: 'Préstamos',
      path: '/admin/prestamos',
      icon: 'pi pi-wallet',
      permission: 'loans.view'
    },
    {
      label: 'Cobradores',
      path: '/admin/cobradores',
      icon: 'pi pi-id-card',
      permission: 'collectors.view'
    },
    {
      label: 'Control diario',
      path: '/admin/control-diario',
      icon: 'pi pi-file-excel',
      permission: 'daily_control.view'
    },
    {
      label: 'Cierre de caja',
      path: '/admin/cierre-caja',
      icon: 'pi pi-calculator',
      permission: 'cash_closure.view'
    },
    {
      label: 'Solicitudes',
      path: '/admin/solicitudes',
      icon: 'pi pi-bell',
      permission: 'correction_requests.view'
    },
    {
      label: 'Auditoría',
      path: '/admin/auditoria',
      icon: 'pi pi-shield',
      permission: 'audit.view'
    },
    {
      label: 'Roles y permisos',
      path: '/admin/roles',
      icon: 'pi pi-key',
      permission: 'roles.view'
    }
  ] as const;

  private readonly navigationButton =
    viewChild<ElementRef<HTMLButtonElement>>('navigationButton');

  private readonly mobileCloseButton =
    viewChild<ElementRef<HTMLButtonElement>>('mobileCloseButton');

  private mql?: MediaQueryList;
  private mqlListener?: (event: MediaQueryListEvent) => void;

  private desktopOpen = true;
  private viewportInitialized = false;

  ngOnInit(): void {
    if (typeof window === 'undefined') return;

    try {
      this.desktopOpen =
        localStorage.getItem('cobranzapro.sidebar.expanded') !== 'false';
    } catch {
      this.desktopOpen = true;
    }

    this.mql = window.matchMedia('(max-width: 1023px)');

    this.applyViewport(this.mql.matches);

    this.mqlListener = (event: MediaQueryListEvent) => {
      this.applyViewport(event.matches);
    };

    this.mql.addEventListener('change', this.mqlListener);
  }

  ngOnDestroy(): void {
    if (this.mqlListener) {
      this.mql?.removeEventListener('change', this.mqlListener);
    }

    if (typeof document !== 'undefined') {
      document.body.classList.remove('app-nav-body-locked');
    }
  }

  toggleNavigation(): void {
    if (this.isMobile()) {
      if (this.open()) {
        this.closeNavigation();
      } else {
        this.open.set(true);

        document.body.classList.add('app-nav-body-locked');

        queueMicrotask(() => {
          this.mobileCloseButton()?.nativeElement.focus();
        });
      }

      return;
    }

    this.desktopOpen = !this.open();
    this.open.set(this.desktopOpen);

    try {
      localStorage.setItem(
        'cobranzapro.sidebar.expanded',
        String(this.desktopOpen)
      );
    } catch {
      // Almacenamiento no disponible
    }
  }

  closeNavigation(): void {
    if (!this.isMobile() || !this.open()) return;

    this.open.set(false);
    document.body.classList.remove('app-nav-body-locked');

    queueMicrotask(() => {
      this.navigationButton()?.nativeElement.focus();
    });
  }

  onSidebarKeydown(event: KeyboardEvent): void {
    if (!this.isMobile() || !this.open()) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeNavigation();
      return;
    }

    if (event.key !== 'Tab') return;

    const sidebar = event.currentTarget as HTMLElement;

    const focusable = Array.from(
      sidebar.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    ).filter((element) => element.getClientRects().length > 0);

    if (!focusable.length) {
      event.preventDefault();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  private applyViewport(mobile: boolean): void {

    if (this.viewportInitialized && !this.isMobile()) {
      this.desktopOpen = this.open();
    }

    this.isMobile.set(mobile);

    this.open.set(mobile ? false : this.desktopOpen);

    this.viewportInitialized = true;

    document.body.classList.remove('app-nav-body-locked');
  }
}
