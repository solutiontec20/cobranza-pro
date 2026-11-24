
import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { LayoutService } from '../core/services/layout.service';
import { AuthService } from '../modules/auth/auth.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],

  template: `
    <div
      class="cp-sidebar"
      [class.cp-sidebar--collapsed]="layoutService.sidebarCollapsed()"
    >

      <!-- BRANDING QUIPU -->
      <div class="cp-sidebar-brand">

        <div class="cp-brand-expanded">

          <img
            class="cp-logo-light"
            src="/cobranzapro-quipu-horizontal-claro.svg"
            alt="CobranzaPro"
          />

          <img
            class="cp-logo-dark"
            src="/cobranzapro-quipu-horizontal-oscuro.svg"
            alt="CobranzaPro"
          />

        </div>

        <div class="cp-brand-collapsed">

          <img
            class="cp-logo-light"
            src="/cobranzapro-quipu-compacto-claro.svg"
            alt="CobranzaPro"
          />

          <img
            class="cp-logo-dark"
            src="/cobranzapro-quipu-compacto-oscuro.svg"
            alt="CobranzaPro"
          />

        </div>

      </div>

      <!-- MENU DE NAVEGACION -->
      <nav class="cp-sidebar-nav" aria-label="Navegación principal">

        @if (authService.isCollector()) {

          <section class="cp-nav-section">

            <h2 class="cp-nav-heading">
              Cobrador
            </h2>

            @for (item of collectorItems; track item.path) {

              <a
                class="cp-nav-link"
                [routerLink]="item.path"
                routerLinkActive="cp-nav-link--active"
                [routerLinkActiveOptions]="{ exact: true }"
                ariaCurrentWhenActive="page"
                [attr.title]="
                  layoutService.sidebarCollapsed()
                    ? item.label
                    : null
                "
              >

                <i
                  [class]="item.icon"
                  aria-hidden="true"
                ></i>

                <span class="cp-nav-label">
                  {{ item.label }}
                </span>

              </a>

            }

          </section>

        } @else if (authService.isAdmin() || authService.isSupervisor()) {

          <section class="cp-nav-section">

            <h2 class="cp-nav-heading">
              Administración
            </h2>

            @for (item of adminItems; track item.path) {

              <a
                class="cp-nav-link"
                [routerLink]="item.path"
                routerLinkActive="cp-nav-link--active"
                [routerLinkActiveOptions]="{ exact: true }"
                ariaCurrentWhenActive="page"
                [attr.title]="
                  layoutService.sidebarCollapsed()
                    ? item.label
                    : null
                "
              >

                <i
                  [class]="item.icon"
                  aria-hidden="true"
                ></i>

                <span class="cp-nav-label">
                  {{ item.label }}
                </span>

              </a>

            }

          </section>

        }

      </nav>

    </div>
  `,

  styles: [`
    :host {
      display: block;
      height: 100%;
      min-height: 0;
    }

    /* VARIABLES MODO CLARO */

    .cp-sidebar {
      --cp-bg: #ffffff;
      --cp-text: #475569;
      --cp-heading: #64748b;
      --cp-hover: #f1f5f9;
      --cp-active-bg: #eaf2ff;
      --cp-active-text: #1d4ed8;
      --cp-active-border: #2563eb;
      --cp-border: #e2e8f0;
      --cp-focus: #2563eb;

      display: flex;
      flex-direction: column;

      width: 100%;
      height: 100%;
      min-height: 0;

      background: var(--cp-bg);
      color: var(--cp-text);
    }

    /* VARIABLES MODO OSCURO */

    :host-context(.dark) .cp-sidebar,
    :host-context(.app-dark) .cp-sidebar,
    :host-context(.my-app-dark) .cp-sidebar {
      --cp-bg: #111827;
      --cp-text: #cbd5e1;
      --cp-heading: #94a3b8;
      --cp-hover: #1e293b;
      --cp-active-bg: #1e3554;
      --cp-active-text: #93c5fd;
      --cp-active-border: #60a5fa;
      --cp-border: #273448;
      --cp-focus: #93c5fd;
    }

    /* BRANDING */

    .cp-sidebar-brand {
      display: flex;
      align-items: center;
      justify-content: flex-start;

      height: 76px;
      min-height: 76px;

      padding: 12px 16px;

      border-bottom: 1px solid var(--cp-border);

      overflow: hidden;
    }

    .cp-brand-expanded {
      display: flex;
      align-items: center;
      min-width: 0;
    }

    .cp-brand-expanded img {
      display: block;
      width: 190px;
      max-width: 100%;
      height: 46px;
      object-fit: contain;
      object-position: left center;
    }

    .cp-brand-collapsed {
      display: none;
    }

    .cp-brand-collapsed img {
      width: 42px;
      height: 42px;
      object-fit: contain;
    }

    /* LOGOS CLARO Y OSCURO */

    .cp-logo-dark {
      display: none !important;
    }

    :host-context(.dark) .cp-logo-light,
    :host-context(.app-dark) .cp-logo-light,
    :host-context(.my-app-dark) .cp-logo-light {
      display: none !important;
    }

    :host-context(.dark) .cp-logo-dark,
    :host-context(.app-dark) .cp-logo-dark,
    :host-context(.my-app-dark) .cp-logo-dark {
      display: block !important;
    }

    /* NAVEGACION */

    .cp-sidebar-nav {
      flex: 1;
      min-height: 0;

      overflow-y: auto;
      overflow-x: hidden;

      padding: 16px 11px;

      scrollbar-width: thin;
      scrollbar-color: var(--cp-border) transparent;
    }

    .cp-nav-section {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    .cp-nav-heading {
      margin: 5px 0 12px;
      padding: 0 12px;

      font-size: 10px;
      font-weight: 750;
      letter-spacing: 0.1em;
      text-transform: uppercase;

      color: var(--cp-heading);
    }

    .cp-nav-link {
      display: flex;
      align-items: center;

      gap: 12px;
      min-height: 44px;
      min-width: 0;

      padding: 10px 12px;

      border-left: 3px solid transparent;
      border-radius: 10px;

      background: transparent;
      color: var(--cp-text);

      font-size: 13px;
      font-weight: 500;
      line-height: 1.3;
      text-decoration: none;

      transition:
        background-color 150ms ease,
        color 150ms ease;
    }

    .cp-nav-link i {
      flex: 0 0 auto;
      width: 19px;
      font-size: 17px;
      text-align: center;
    }

    .cp-nav-label {
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    /* HOVER */

    .cp-nav-link:hover {
      background: var(--cp-hover);
    }

    /* RUTA ACTIVA */

    .cp-nav-link--active,
    .cp-nav-link--active:hover {
      background: var(--cp-active-bg);
      color: var(--cp-active-text);
      border-left-color: var(--cp-active-border);
      font-weight: 700;
    }

    .cp-nav-link:focus-visible {
      outline: 2px solid var(--cp-focus);
      outline-offset: 2px;
    }

    /* SIDEBAR COLAPSADO */

    .cp-sidebar--collapsed .cp-sidebar-brand {
      justify-content: center;
      padding-inline: 7px;
    }

    .cp-sidebar--collapsed .cp-brand-expanded {
      display: none;
    }

    .cp-sidebar--collapsed .cp-brand-collapsed {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 42px;
      height: 42px;
    }

    .cp-sidebar--collapsed .cp-nav-heading,
    .cp-sidebar--collapsed .cp-nav-label {
      display: none;
    }

    .cp-sidebar--collapsed .cp-sidebar-nav {
      padding-inline: 10px;
    }

    .cp-sidebar--collapsed .cp-nav-link {
      justify-content: center;
      gap: 0;
      padding-inline: 0;
    }

    .cp-sidebar--collapsed .cp-nav-link i {
      width: auto;
    }

    /* MOBILE */

    @media (max-width: 767px) {
      .cp-sidebar-nav {
        padding-inline: 12px;
      }

      .cp-nav-link {
        min-height: 44px;
      }

      .cp-sidebar-brand {
        padding-inline: 14px;
      }
    }

    /* ACCESIBILIDAD */

    @media (prefers-reduced-motion: reduce) {
      .cp-nav-link {
        transition: none;
      }
    }
  `]
})
export class Sidebar {

  readonly layoutService = inject(LayoutService);
  readonly authService = inject(AuthService);

  readonly collectorItems = [
    {
      label: 'Cobranza de hoy',
      path: '/cobrador',
      icon: 'pi pi-home'
    },
    {
      label: 'Mis Clientes',
      path: '/cobrador/clientes',
      icon: 'pi pi-users'
    },
    {
      label: 'Cierre de Caja',
      path: '/cobrador/cierre-caja',
      icon: 'pi pi-calculator'
    },
    {
      label: 'Perfil',
      path: '/perfil',
      icon: 'pi pi-user'
    }
  ] as const;

  readonly adminItems = [
    {
      label: 'Dashboard',
      path: '/admin/dashboard',
      icon: 'pi pi-chart-bar'
    },
    {
      label: 'Clientes',
      path: '/admin/clientes',
      icon: 'pi pi-users'
    },
    {
      label: 'Préstamos',
      path: '/admin/prestamos',
      icon: 'pi pi-wallet'
    },
    {
      label: 'Cobradores',
      path: '/admin/cobradores',
      icon: 'pi pi-id-card'
    },
    {
      label: 'Control Diario',
      path: '/admin/control-diario',
      icon: 'pi pi-file-excel'
    },
    {
      label: 'Cierre de Caja',
      path: '/admin/cierre-caja',
      icon: 'pi pi-calculator'
    },
    {
      label: 'Auditoría',
      path: '/admin/auditoria',
      icon: 'pi pi-shield'
    }
  ] as const;
}
