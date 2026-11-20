import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { CollectorPerformanceEntry } from '../../../core/models/admin-dashboard.model';
import { PenCurrency } from '../../../shared/pipes/pen-currency';

@Component({
  selector: 'app-collector-performance-table',
  imports: [ButtonModule, PenCurrency, RouterLink, TableModule],
  host: {
    class: 'block overflow-x-auto',
    'data-testid': 'collector-performance-desktop',
  },
  template: `
    <p-table
      [value]="entries()"
      [tableStyle]="{ 'min-width': '58rem' }"
      styleClass="p-datatable-sm"
    >
      <ng-template #header>
        <tr>
          <th>Cobrador</th>
          <th>Clientes</th>
          <th>Esperado hoy</th>
          <th>Cobrado hoy</th>
          <th>Pendiente</th>
          <th>Atrasados</th>
          <th class="text-center">Acciones</th>
        </tr>
      </ng-template>
      <ng-template #body let-col>
        <tr>
          <td>
            <div class="font-bold text-surface-900 dark:text-surface-0">{{ col.name }}</div>
            <div class="text-xs text-surface-500">DNI: {{ col.dni }}</div>
          </td>
          <td>{{ col.clientsCount }}</td>
          <td class="font-medium">{{ col.expectedToday | penCurrency }}</td>
          <td class="font-bold text-green-600 dark:text-green-400">
            {{ col.collectedToday | penCurrency }}
          </td>
          <td class="text-surface-500">{{ col.pendingToday | penCurrency }}</td>
          <td>
            <span
              class="rounded-full px-2.5 py-1 text-sm font-semibold"
              [class.bg-green-100]="col.delayedCount === 0"
              [class.text-green-700]="col.delayedCount === 0"
              [class.bg-yellow-100]="col.delayedCount > 0"
              [class.text-yellow-700]="col.delayedCount > 0"
            >
              {{ col.delayedCount }}
            </span>
          </td>
          <td class="text-center">
            <a
              pButton
              variant="outlined"
              size="small"
              [routerLink]="['/admin/clientes']"
              [queryParams]="{ collectorId: col.id }"
            >
              <i class="pi pi-eye mr-2" aria-hidden="true"></i>Ver cartera
            </a>
          </td>
        </tr>
      </ng-template>
      <ng-template #emptymessage>
        <tr>
          <td colspan="7" class="p-8 text-center text-surface-500">
            No hay datos de cobradores.
          </td>
        </tr>
      </ng-template>
    </p-table>
  `,
})
export class CollectorPerformanceTable {
  readonly entries = input.required<CollectorPerformanceEntry[]>();
}
