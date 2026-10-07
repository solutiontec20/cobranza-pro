import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { AppStoreService } from '../../../core/services/app-store.service';
import { AuthService } from '../../auth/auth.service';
import { CollectionClientCard } from '../../../shared/ui/collection-client-card/collection-client-card';
import { CollectionDashboardStore } from '../collection-dashboard.store';

@Component({
  selector: 'app-collector-clients',
  imports: [
    ButtonModule,
    CollectionClientCard,
    IconFieldModule,
    InputIconModule,
    InputTextModule,
    TagModule,
  ],
  template: `
    <div class="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <header>
        <h1 class="m-0 text-2xl font-semibold tracking-tight text-surface-950 sm:text-3xl dark:text-surface-0">
          Mis Clientes
        </h1>
        <p class="mt-1 mb-0 text-sm text-surface-500 dark:text-surface-400">
          Tenés {{ store.clients().length }} clientes en tu cartera de cobranza.
        </p>
      </header>

      <div>
        <label for="clients-search" class="sr-only">Buscar cliente</label>
        <p-iconfield class="w-full max-w-md">
          <p-inputicon class="pi pi-search" />
          <input
            id="clients-search"
            pInputText
            type="search"
            autocomplete="off"
            placeholder="Buscar nombre, DNI o teléfono…"
            class="w-full"
            [value]="store.query()"
            (input)="updateQuery($event)"
          />
        </p-iconfield>
      </div>

      @if (store.filteredClients().length > 0) {
        <div class="grid gap-3 lg:grid-cols-2">
          @for (client of store.filteredClients(); track client.id) {
            <app-collection-client-card
              [client]="client"
              (paymentRequested)="goToDetail($event.id)"
            />
          }
        </div>
      } @else {
        <div class="rounded-xl border border-dashed border-surface-300 bg-surface-0 px-6 py-12 text-center dark:border-surface-700 dark:bg-surface-900">
          <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-surface-100 text-surface-500 dark:bg-surface-800 dark:text-surface-300">
            <i class="pi pi-users" aria-hidden="true"></i>
          </div>
          <h3 class="mt-4 mb-1 text-lg font-semibold text-surface-950 dark:text-surface-0">No hay clientes</h3>
          <p class="mt-0 mb-4 text-sm text-surface-500 dark:text-surface-400">No se encontraron clientes con esa búsqueda.</p>
          <p-button type="button" severity="secondary" variant="outlined" label="Limpiar búsqueda" (click)="store.clearFilters()"></p-button>
        </div>
      }
    </div>
  `,
})
export default class CollectorClients {
  private router = inject(Router);
  readonly store = inject(CollectionDashboardStore);

  updateQuery(event: Event) {
    this.store.setQuery((event.target as HTMLInputElement).value);
  }

  goToDetail(clientId: string) {
    this.router.navigate(['/cobrador/cliente', clientId]);
  }
}
