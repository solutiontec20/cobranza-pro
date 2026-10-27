import { Component, computed, inject, signal } from '@angular/core';
import {
  form,
  FormField,
  max,
  maxLength,
  min,
  pattern,
  required,
  submit,
  validate,
} from '@angular/forms/signals';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { SkeletonModule } from 'primeng/skeleton';
import { TagModule } from 'primeng/tag';
import { calculateLoanSummary, firstDueOn, toDateInput } from '../../../core/calculations/loan-calculations';
import { LoanFrequency } from '../../../core/models/loan.model';
import { EsDate } from '../../../shared/pipes/es-date';
import { PenCurrency } from '../../../shared/pipes/pen-currency';
import { DigitsOnly } from '../../../shared/directives/digits-only';
import { CollectionClientCard } from '../../../shared/ui/collection-client-card/collection-client-card';
import { CollectionDashboardStore } from '../collection-dashboard.store';

interface NewClientFormModel {
  dni: string;
  fullName: string;
  phone: string;
  address: string;
  notes: string;
  principal: number;
  interestRate: number;
  frequency: LoanFrequency;
  installmentCount: number;
  startedOn: string;
}

const emptyModel = (): NewClientFormModel => ({
  dni: '',
  fullName: '',
  phone: '',
  address: '',
  notes: '',
  principal: 100,
  interestRate: 20,
  frequency: 'daily',
  installmentCount: 24,
  startedOn: toDateInput(new Date()),
});

@Component({
  selector: 'app-collector-clients',
  imports: [
    ButtonModule,
    DigitsOnly,
    CollectionClientCard,
    DialogModule,
    EsDate,
    FormField,
    IconFieldModule,
    InputIconModule,
    InputNumberModule,
    InputTextModule,
    MessageModule,
    PenCurrency,
    SelectModule,
    SkeletonModule,
    TagModule,
  ],
  template: `
    <div class="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <header class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 class="m-0 text-2xl font-semibold tracking-tight text-surface-950 sm:text-3xl dark:text-surface-0">
            Mis Clientes
          </h1>
          <p class="mt-1 mb-0 text-sm text-surface-500 dark:text-surface-400">
            Tenés {{ store.clients().length }} clientes en tu cartera de cobranza.
          </p>
        </div>
        <button pButton type="button" class="min-h-11 w-full sm:w-auto" (click)="openCreateDialog()">
          <i class="pi pi-user-plus"></i> Nuevo cliente
        </button>
      </header>

      @if (store.error()) {
        <p-message severity="error" styleClass="w-full" role="alert">{{ store.error() }}</p-message>
      }

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

      @if (store.loading()) {
        <div class="grid gap-3 lg:grid-cols-2" aria-label="Cargando clientes" aria-live="polite">
          @for (row of loadingRows; track row) {
            <p-skeleton height="11rem" borderRadius="0.75rem" />
          }
        </div>
      } @else if (store.filteredClients().length > 0) {
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
          <button pButton type="button" severity="secondary" variant="outlined" (click)="store.clearFilters()">
            Limpiar búsqueda
          </button>
        </div>
      }
    </div>

    @defer (when dialogVisible()) {
      <p-dialog
        header="Nuevo cliente"
        [modal]="true"
        [visible]="dialogVisible()"
        (visibleChange)="dialogVisible.set($event)"
        [breakpoints]="{ '640px': '100vw' }"
        styleClass="w-[calc(100vw-1.5rem)] max-w-2xl"
      >
        <form class="flex flex-col gap-5" (submit)="saveClient(); $event.preventDefault()">
          <p class="m-0 text-sm text-surface-500 dark:text-surface-400">
            Registrá al cliente y su primer préstamo en un solo paso: así queda disponible de inmediato en tu
            ruta de cobranza.
          </p>

          @if (store.error()) {
            <p-message severity="error" styleClass="w-full" role="alert">{{ store.error() }}</p-message>
          }

          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <label for="new-client-dni" class="mb-2 block text-sm font-medium text-surface-700 dark:text-surface-200">DNI</label>
              <input pInputText appDigitsOnly id="new-client-dni" [formField]="clientForm.dni" class="w-full" inputmode="numeric" />
              @if (clientForm.dni().touched() && clientForm.dni().invalid()) {
                <small class="mt-1 block text-red-600">{{ clientForm.dni().errors()[0]?.message }}</small>
              }
            </div>
            <div>
              <label for="new-client-name" class="mb-2 block text-sm font-medium text-surface-700 dark:text-surface-200">Nombre completo</label>
              <input pInputText id="new-client-name" [formField]="clientForm.fullName" class="w-full" />
              @if (clientForm.fullName().touched() && clientForm.fullName().invalid()) {
                <small class="mt-1 block text-red-600">{{ clientForm.fullName().errors()[0]?.message }}</small>
              }
            </div>
          </div>

          <div>
            <label for="new-client-phone" class="mb-2 block text-sm font-medium text-surface-700 dark:text-surface-200">Teléfono</label>
            <input pInputText appDigitsOnly id="new-client-phone" [formField]="clientForm.phone" class="w-full" inputmode="tel" />
            @if (clientForm.phone().touched() && clientForm.phone().invalid()) {
              <small class="mt-1 block text-red-600">{{ clientForm.phone().errors()[0]?.message }}</small>
            }
          </div>

          <div>
            <label for="new-client-address" class="mb-2 block text-sm font-medium text-surface-700 dark:text-surface-200">Dirección</label>
            <input pInputText id="new-client-address" [formField]="clientForm.address" class="w-full" />
            @if (clientForm.address().touched() && clientForm.address().invalid()) {
              <small class="mt-1 block text-red-600">{{ clientForm.address().errors()[0]?.message }}</small>
            }
          </div>

          <div>
            <label for="new-client-notes" class="mb-2 block text-sm font-medium text-surface-700 dark:text-surface-200">Observaciones</label>
            <textarea id="new-client-notes" [formField]="clientForm.notes" rows="2"
              class="w-full resize-none rounded-md border border-surface-300 bg-surface-0 px-3 py-2 text-surface-950 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-surface-600 dark:bg-surface-950 dark:text-surface-0"></textarea>
            @if (clientForm.notes().touched() && clientForm.notes().invalid()) {
              <small class="mt-1 block text-red-600">{{ clientForm.notes().errors()[0]?.message }}</small>
            }
          </div>

          <hr class="border-surface-200 dark:border-surface-700" />

          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <label for="new-client-principal" class="mb-2 block text-sm font-medium text-surface-700 dark:text-surface-200">Capital</label>
              <p-inputnumber inputId="new-client-principal" [formField]="clientForm.principal" mode="currency"
                currency="PEN" locale="es-PE" styleClass="w-full" />
              @if (clientForm.principal().touched() && clientForm.principal().invalid()) {
                <small class="mt-1 block text-red-600">{{ clientForm.principal().errors()[0]?.message }}</small>
              }
            </div>
            <div>
              <label for="new-client-rate" class="mb-2 block text-sm font-medium text-surface-700 dark:text-surface-200">Tasa de interés</label>
              <p-inputnumber inputId="new-client-rate" [formField]="clientForm.interestRate" suffix="%"
                [maxFractionDigits]="4" styleClass="w-full" />
              @if (clientForm.interestRate().touched() && clientForm.interestRate().invalid()) {
                <small class="mt-1 block text-red-600">{{ clientForm.interestRate().errors()[0]?.message }}</small>
              }
            </div>
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <label for="new-client-frequency" class="mb-2 block text-sm font-medium text-surface-700 dark:text-surface-200">Frecuencia</label>
              <p-select inputId="new-client-frequency" [formField]="clientForm.frequency" [options]="frequencyOptions"
                optionLabel="label" optionValue="value" appendTo="body" styleClass="w-full" />
            </div>
            <div>
              <label for="new-client-count" class="mb-2 block text-sm font-medium text-surface-700 dark:text-surface-200">Cantidad de cuotas</label>
              <p-inputnumber inputId="new-client-count" [formField]="clientForm.installmentCount" [useGrouping]="false"
                styleClass="w-full" />
              @if (clientForm.installmentCount().touched() && clientForm.installmentCount().invalid()) {
                <small class="mt-1 block text-red-600">{{ clientForm.installmentCount().errors()[0]?.message }}</small>
              }
            </div>
          </div>

          <div>
            <label for="new-client-start" class="mb-2 block text-sm font-medium text-surface-700 dark:text-surface-200">Fecha de inicio</label>
            <input id="new-client-start" type="date" [formField]="clientForm.startedOn"
              class="w-full rounded-md border border-surface-300 px-3 py-2.5 text-surface-950 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-surface-600 dark:bg-surface-950 dark:text-surface-0" />
            @if (clientForm.startedOn().touched() && clientForm.startedOn().invalid()) {
              <small class="mt-1 block text-red-600">{{ clientForm.startedOn().errors()[0]?.message }}</small>
            }
          </div>

          <section class="grid grid-cols-2 gap-3 rounded-xl border border-surface-200 bg-surface-50 p-4 text-sm dark:border-surface-700 dark:bg-surface-800 sm:grid-cols-3" aria-label="Resumen del préstamo">
            <div>
              <p class="m-0 text-surface-500 dark:text-surface-400">Total a pagar</p>
              <p class="mt-1 mb-0 font-semibold">{{ summary().totalAmount | penCurrency }}</p>
            </div>
            <div>
              <p class="m-0 text-surface-500 dark:text-surface-400">Cuota base</p>
              <p class="mt-1 mb-0 font-semibold text-primary-600 dark:text-primary-400">{{ summary().baseInstallmentAmount | penCurrency }}</p>
            </div>
            <div class="col-span-2 sm:col-span-1">
              <p class="m-0 text-surface-500 dark:text-surface-400">Primer pago</p>
              <p class="mt-1 mb-0 font-semibold">{{ firstDueDate() | esDate }}</p>
            </div>
          </section>

          <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button pButton type="button" severity="secondary" variant="text" class="min-h-11 w-full sm:w-auto"
              (click)="dialogVisible.set(false)">
              Cancelar
            </button>
            <button pButton type="submit" class="min-h-11 w-full sm:w-auto"
              [disabled]="store.saving() || clientForm().invalid()">
              @if (store.saving()) {
                <i class="pi pi-spin pi-spinner"></i>
              } @else {
                <i class="pi pi-check"></i>
              }
              Registrar cliente
            </button>
          </div>
        </form>
      </p-dialog>
    } @error {
      <p-message severity="error" styleClass="w-full">No se pudo cargar el formulario de nuevo cliente.</p-message>
    }
  `,
})
export default class CollectorClients {
  private readonly router = inject(Router);
  private readonly messageService = inject(MessageService);
  readonly store = inject(CollectionDashboardStore);

  protected readonly loadingRows = [1, 2];
  protected readonly dialogVisible = signal(false);
  protected readonly frequencyOptions: Array<{ label: string; value: LoanFrequency }> = [
    { label: 'Diario', value: 'daily' },
    { label: 'Semanal', value: 'weekly' },
    { label: 'Mensual', value: 'monthly' },
  ];

  protected readonly clientModel = signal<NewClientFormModel>(emptyModel());
  protected readonly clientForm = form(this.clientModel, (path) => {
    required(path.dni, { message: 'Ingresá el DNI.' });
    pattern(path.dni, /^\d{8,12}$/, { message: 'El DNI debe contener entre 8 y 12 dígitos.' });
    required(path.fullName, { message: 'Ingresá el nombre completo.' });
    pattern(path.fullName, /.*\S.*/, { message: 'Ingresá un nombre válido.' });
    maxLength(path.fullName, 160, { message: 'El nombre es demasiado largo.' });
    pattern(path.phone, /^\d{0,15}$/, { message: 'El teléfono solo puede contener dígitos.' });
    required(path.address, { message: 'Ingresá la dirección.' });
    pattern(path.address, /.*\S.*/, { message: 'Ingresá una dirección válida.' });
    maxLength(path.notes, 500, { message: 'Las observaciones no pueden superar 500 caracteres.' });
    min(path.principal, 0.01, { message: 'El capital debe ser mayor que cero.' });
    min(path.interestRate, 0, { message: 'La tasa no puede ser negativa.' });
    min(path.installmentCount, 1, { message: 'Debe existir al menos una cuota.' });
    max(path.installmentCount, 32767, { message: 'La cantidad de cuotas es demasiado alta.' });
    required(path.startedOn, { message: 'Seleccioná la fecha de inicio.' });
    validate(path.installmentCount, ({ valueOf }) => {
      const summary = calculateLoanSummary(
        valueOf(path.principal),
        valueOf(path.interestRate),
        valueOf(path.installmentCount),
      );
      return summary.baseInstallmentAmount > 0 && summary.lastInstallmentAmount > 0
        ? undefined
        : { kind: 'invalidSchedule', message: 'La cantidad de cuotas genera importes inválidos.' };
    });
  });

  protected readonly summary = computed(() => {
    const model = this.clientModel();
    return calculateLoanSummary(model.principal, model.interestRate, model.installmentCount);
  });
  protected readonly firstDueDate = computed(() => {
    const model = this.clientModel();
    return firstDueOn(model.startedOn, model.frequency);
  });

  constructor() {
    void this.store.load();
  }

  updateQuery(event: Event) {
    this.store.setQuery((event.target as HTMLInputElement).value);
  }

  goToDetail(clientId: string) {
    this.router.navigate(['/cobrador/cliente', clientId]);
  }

  protected openCreateDialog(): void {
    this.store.clearError();
    this.clientModel.set(emptyModel());
    this.clientForm().reset();
    this.dialogVisible.set(true);
  }

  protected saveClient(): void {
    void submit(this.clientForm, async () => {
      const model = this.clientModel();
      const created = await this.store.create({
        dni: model.dni,
        fullName: model.fullName,
        phone: model.phone,
        address: model.address,
        notes: model.notes,
        principal: model.principal,
        interestRate: model.interestRate,
        frequency: model.frequency,
        installmentCount: model.installmentCount,
        startedOn: model.startedOn,
      });

      if (created) {
        this.dialogVisible.set(false);
        this.messageService.add({
          severity: 'success',
          summary: 'Cliente registrado',
          detail: 'El cliente y su primer préstamo ya están disponibles en tu cartera.',
        });
      }
    });
  }
}
