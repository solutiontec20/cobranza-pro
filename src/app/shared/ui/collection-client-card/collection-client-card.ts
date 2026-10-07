import { CurrencyPipe } from '@angular/common';
import { Component, computed, input, output } from '@angular/core';
import { ButtonDirective } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { CollectionClient } from '../../../modules/collector/collection.model';

@Component({
  selector: 'app-collection-client-card',
  imports: [ButtonDirective, CurrencyPipe, TagModule],
  host: { class: 'block' },
  template: `
    <article
      class="overflow-hidden rounded-xl border border-surface-200 bg-surface-0 shadow-sm dark:border-surface-700 dark:bg-surface-900"
      [class.border-l-4]="client().risk !== 'current' && client().risk !== 'paid'"
      [class.border-l-yellow-500]="client().risk === 'warning'"
      [class.border-l-orange-500]="client().risk === 'late'"
      [class.border-l-red-600]="client().risk === 'defaulted'"
    >
      <div class="p-4 sm:p-5">
        <header class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <h3 class="m-0 truncate text-lg font-semibold text-surface-950 dark:text-surface-0">
              {{ client().fullName }}
            </h3>
            <p class="mt-1 mb-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-surface-500 dark:text-surface-400">
              <span>DNI {{ client().dni }}</span>
              <span aria-hidden="true">·</span>
              <span class="truncate"><i class="pi pi-map-marker mr-1" aria-hidden="true"></i>{{ shortAddress() }}</span>
            </p>
          </div>
          <div class="flex shrink-0 flex-col items-end gap-1.5">
            <p-tag [severity]="severity()" [value]="riskLabel()" />
            @if (client().paidToday) {
              <span class="text-xs font-medium text-green-700 dark:text-green-400">
                <i class="pi pi-check-circle mr-1" aria-hidden="true"></i>Pagó hoy
              </span>
            }
          </div>
        </header>

        <dl class="mt-4 grid grid-cols-3 divide-x divide-surface-200 rounded-lg bg-surface-50 py-3 dark:divide-surface-700 dark:bg-surface-800/70">
          <div class="px-3">
            <dt class="text-xs text-surface-500 dark:text-surface-400">Cuota</dt>
            <dd class="mt-1 mb-0 font-semibold tabular-nums text-surface-950 dark:text-surface-0">
              {{ client().installmentAmount | currency: 'PEN' : 'symbol' : '1.2-2' : 'es-PE' }}
            </dd>
          </div>
          <div class="px-3">
            <dt class="text-xs text-surface-500 dark:text-surface-400">Saldo</dt>
            <dd class="mt-1 mb-0 font-semibold tabular-nums text-surface-950 dark:text-surface-0">
              {{ client().balance | currency: 'PEN' : 'symbol' : '1.2-2' : 'es-PE' }}
            </dd>
          </div>
          <div class="px-3">
            <dt class="text-xs text-surface-500 dark:text-surface-400">Atraso</dt>
            <dd
              class="mt-1 mb-0 font-semibold tabular-nums"
              [class.text-red-600]="client().risk === 'defaulted'"
              [class.text-orange-600]="client().risk === 'late'"
              [class.text-yellow-700]="client().risk === 'warning'"
              [class.text-green-700]="client().overdueDays === 0"
            >
              {{ client().overdueDays }} días
            </dd>
          </div>
        </dl>

        <footer class="mt-4 flex items-center gap-2">
          <a
            class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-surface-300 text-surface-600 hover:bg-surface-100 focus-visible:ring-2 focus-visible:ring-primary-500 dark:border-surface-600 dark:text-surface-300 dark:hover:bg-surface-800"
            [href]="'tel:+51' + client().phone"
            [attr.aria-label]="'Llamar a ' + client().fullName"
          >
            <i class="pi pi-phone" aria-hidden="true"></i>
          </a>
          <a
            class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-surface-300 text-surface-600 hover:bg-surface-100 focus-visible:ring-2 focus-visible:ring-primary-500 dark:border-surface-600 dark:text-surface-300 dark:hover:bg-surface-800"
            [href]="mapUrl()"
            target="_blank"
            rel="noreferrer"
            [attr.aria-label]="'Abrir ubicación de ' + client().fullName"
          >
            <i class="pi pi-map-marker" aria-hidden="true"></i>
          </a>
          <button
            pButton
            type="button"
            icon="pi pi-wallet"
            label="Registrar pago"
            class="ml-auto min-h-10 flex-1 sm:flex-none"
            [disabled]="client().loanStatus !== 'ACTIVE' || client().balance === 0"
            (click)="paymentRequested.emit(client())"
          ></button>
        </footer>
      </div>
    </article>
  `,
})
export class CollectionClientCard {
  readonly client = input.required<CollectionClient>();
  readonly paymentRequested = output<CollectionClient>();

  readonly shortAddress = computed(() => this.client().address.split(',')[0]);
  readonly mapUrl = computed(
    () =>
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(this.client().address)}`,
  );
  readonly severity = computed(() => {
    switch (this.client().risk) {
      case 'current':
      case 'paid':
        return 'success' as const;
      case 'warning':
        return 'warn' as const;
      case 'late':
        return 'warn' as const;
      case 'defaulted':
        return 'danger' as const;
    }
  });
  readonly riskLabel = computed(() => {
    const client = this.client();
    switch (client.risk) {
      case 'current':
        return 'Al día';
      case 'paid':
        return 'Préstamo pagado';
      case 'warning':
      case 'late':
        return `Atraso: ${client.overdueDays} d`;
      case 'defaulted':
        return `Moroso: ${client.overdueDays} d`;
    }
  });
}
