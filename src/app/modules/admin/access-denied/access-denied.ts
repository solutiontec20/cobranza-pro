import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { AccessPermission } from '../../../core/models/access-control.model';
import { AccessControlService } from '../../../core/services/access-control.service';

/** Sections a user can land on, in menu order. The first one the user may view is offered. */
const LANDING_SECTIONS: ReadonlyArray<{
  permission: AccessPermission;
  path: string;
  label: string;
}> = [
  { permission: 'dashboard.view', path: '/admin/dashboard', label: 'Ir al dashboard' },
  { permission: 'analytics.view', path: '/admin/analiticas', label: 'Ir a analíticas' },
  { permission: 'clients.view', path: '/admin/clientes', label: 'Ir a clientes' },
  { permission: 'loans.view', path: '/admin/prestamos', label: 'Ir a préstamos' },
  { permission: 'collectors.view', path: '/admin/cobradores', label: 'Ir a cobradores' },
  { permission: 'daily_control.view', path: '/admin/control-diario', label: 'Ir a control diario' },
  { permission: 'cash_closure.view', path: '/admin/cierre-caja', label: 'Ir a cierre de caja' },
  { permission: 'correction_requests.view', path: '/admin/solicitudes', label: 'Ir a solicitudes' },
  { permission: 'roles.view', path: '/admin/roles', label: 'Ir a roles y permisos' },
];

@Component({
  selector: 'app-access-denied',
  imports: [RouterLink, ButtonModule],
  template: `
    <section
      class="mx-auto flex max-w-xl flex-col items-start gap-4 rounded-xl border border-surface-200 bg-surface-0 p-6 shadow-sm dark:border-surface-700 dark:bg-surface-900"
      role="status"
      aria-labelledby="access-denied-title"
    >
      <div class="flex items-center gap-3 text-orange-600 dark:text-orange-400">
        <i class="pi pi-lock text-2xl" aria-hidden="true"></i>
        <h1 id="access-denied-title" class="text-xl font-semibold">Sin acceso</h1>
      </div>
      <p class="text-sm leading-6 text-muted-color">
        Tu rol no tiene permiso para ver esta sección. Si necesitás acceso, contactá a un
        administrador.
      </p>
      @if (landing(); as target) {
        <a pButton [routerLink]="target.path" data-testid="access-denied-landing">
          <i class="pi pi-arrow-left" aria-hidden="true"></i>
          <span>{{ target.label }}</span>
        </a>
      } @else {
        <a pButton routerLink="/cambiar-pin" severity="secondary" outlined>
          <i class="pi pi-arrow-left" aria-hidden="true"></i>
          <span>Volver a seguridad</span>
        </a>
      }
    </section>
  `,
})
export default class AccessDenied {
  private readonly access = inject(AccessControlService);

  protected readonly landing = computed(
    () => LANDING_SECTIONS.find((section) => this.access.can(section.permission)) ?? null,
  );
}
