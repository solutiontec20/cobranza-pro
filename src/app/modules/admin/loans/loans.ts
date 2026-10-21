import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { form, FormField, max, min, required, submit, validate } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { SkeletonModule } from 'primeng/skeleton';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { LoanFrequency, LoanStatus } from '../../../core/models/loan.model';
import { calculateLoanSummary, firstDueOn, toDateInput } from './loan-calculations';
import { LoansStore } from './loans.store';

interface LoanFormModel {
  clientId: string;
  principal: number;
  interestRate: number;
  frequency: LoanFrequency;
  installmentCount: number;
  startedOn: string;
}

const emptyModel = (): LoanFormModel => ({
  clientId: '',
  principal: 100,
  interestRate: 20,
  frequency: 'daily',
  installmentCount: 24,
  startedOn: toDateInput(new Date()),
});

@Component({
  selector: 'app-admin-loans',
  imports: [
    ButtonModule,
    CurrencyPipe,
    DialogModule,
    FormField,
    InputNumberModule,
    MessageModule,
    RouterLink,
    SelectModule,
    SkeletonModule,
    TableModule,
    TagModule,
  ],
  template: `
    <main class="mx-auto flex w-full max-w-7xl flex-col gap-5 p-3 sm:p-6" aria-labelledby="loans-title">
      <header class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p class="mb-1 text-sm font-medium text-primary">Créditos</p>
          <h1 id="loans-title" class="text-2xl font-bold text-color sm:text-3xl">Préstamos</h1>
          <p class="mt-1 max-w-2xl text-sm text-muted-color">
            Consulta cada préstamo en una página completa con el cliente, el cronograma y sus pagos.
          </p>
        </div>
        <p-button
          label="Nuevo préstamo"
          icon="pi pi-plus"
          styleClass="w-full sm:w-auto"
          [disabled]="store.loading()"
          (onClick)="openCreateDialog()"
        />
      </header>

      @if (store.error()) {
        <p-message severity="error" styleClass="w-full" role="alert">{{ store.error() }}</p-message>
      }

      @if (store.loading()) {
        <section class="space-y-3" aria-label="Cargando préstamos" aria-live="polite">
          @for (row of loadingRows; track row) {
            <p-skeleton height="8rem" borderRadius="0.75rem" />
          }
        </section>
      } @else if (store.loans().length === 0) {
        <section class="rounded-xl border border-dashed border-surface bg-surface-0 px-6 py-14 text-center dark:bg-surface-900">
          <i class="pi pi-wallet mb-4 text-4xl text-muted-color" aria-hidden="true"></i>
          <h2 class="text-lg font-semibold text-color">Todavía no hay préstamos</h2>
          <p class="mt-1 text-sm text-muted-color">Crea el primero para un cliente activo sin crédito vigente.</p>
        </section>
      } @else {
        <section class="space-y-3 md:hidden" aria-label="Listado de préstamos">
          @for (loan of store.loans(); track loan.id) {
            <article class="overflow-hidden rounded-xl border border-surface bg-surface-0 shadow-sm dark:bg-surface-900">
              <div class="border-l-4 border-primary p-4">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <h2 class="truncate text-lg font-semibold text-color">{{ loan.clientName }}</h2>
                    <p class="mt-0.5 text-sm text-muted-color">{{ loan.collectorName }}</p>
                  </div>
                  <p-tag
                    [severity]="loan.status === 'active' ? 'success' : 'secondary'"
                    [value]="statusLabel(loan.status)"
                  />
                </div>

                <dl class="mt-4 grid grid-cols-3 gap-3 border-y border-surface py-3 text-sm">
                  <div>
                    <dt class="text-muted-color">Cuota</dt>
                    <dd class="mt-1 font-semibold text-primary">
                      {{ loan.installmentAmount | currency: 'PEN' : 'symbol' : '1.2-2' : 'es-PE' }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-muted-color">Saldo</dt>
                    <dd class="mt-1 font-semibold text-color">
                      {{ loan.balance | currency: 'PEN' : 'symbol' : '1.2-2' : 'es-PE' }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-muted-color">Frecuencia</dt>
                    <dd class="mt-1 font-semibold text-color">{{ frequencyLabel(loan.frequency) }}</dd>
                  </div>
                </dl>

                <div class="mt-3 flex items-center justify-between text-xs text-muted-color">
                  <span>Inicio: {{ formatDate(loan.startedOn) }}</span>
                  <span>{{ loan.installmentCount }} cuotas</span>
                </div>

                <a
                  [routerLink]="[loan.id]"
                  class="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 font-semibold text-primary-contrast outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                  [attr.aria-label]="'Ver detalle del préstamo de ' + loan.clientName"
                >
                  <i class="pi pi-arrow-right" aria-hidden="true"></i>
                  Ver detalle
                </a>
              </div>
            </article>
          }
        </section>

        <section class="hidden overflow-hidden rounded-xl border border-surface bg-surface-0 shadow-sm dark:bg-surface-900 md:block">
          <p-table
            [value]="store.loans()"
            [rows]="10"
            [paginator]="store.loans().length > 10"
            responsiveLayout="scroll"
            styleClass="p-datatable-sm"
          >
            <ng-template #header>
              <tr>
                <th>Cliente</th>
                <th>Cobrador</th>
                <th>Capital</th>
                <th>Total</th>
                <th>Cuota</th>
                <th>Saldo</th>
                <th>Frecuencia</th>
                <th>Estado</th>
                <th class="text-right">Acción</th>
              </tr>
            </ng-template>
            <ng-template #body let-loan>
              <tr>
                <td>
                  <span class="font-semibold">{{ loan.clientName }}</span><br />
                  <small class="text-muted-color">Inicio: {{ formatDate(loan.startedOn) }}</small>
                </td>
                <td>{{ loan.collectorName }}</td>
                <td>{{ loan.principal | currency: 'PEN' : 'symbol' : '1.2-2' : 'es-PE' }}</td>
                <td class="font-semibold">{{ loan.totalAmount | currency: 'PEN' : 'symbol' : '1.2-2' : 'es-PE' }}</td>
                <td>{{ loan.installmentAmount | currency: 'PEN' : 'symbol' : '1.2-2' : 'es-PE' }}</td>
                <td class="font-semibold">{{ loan.balance | currency: 'PEN' : 'symbol' : '1.2-2' : 'es-PE' }}</td>
                <td><p-tag severity="secondary" [value]="frequencyLabel(loan.frequency)" /></td>
                <td>
                  <p-tag
                    [severity]="loan.status === 'active' ? 'success' : 'secondary'"
                    [value]="statusLabel(loan.status)"
                  />
                </td>
                <td class="text-right">
                  <a
                    [routerLink]="[loan.id]"
                    class="inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-3 py-2 font-semibold text-primary outline-none hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary"
                    [attr.aria-label]="'Ver detalle del préstamo de ' + loan.clientName"
                  >
                    Ver detalle
                    <i class="pi pi-arrow-right" aria-hidden="true"></i>
                  </a>
                </td>
              </tr>
            </ng-template>
          </p-table>
        </section>
      }
    </main>

    <p-dialog
      header="Nuevo préstamo"
      [modal]="true"
      [visible]="createDialogVisible()"
      (visibleChange)="createDialogVisible.set($event)"
      styleClass="w-[calc(100vw-1.5rem)] max-w-2xl"
    >
      <form class="flex flex-col gap-5" (submit)="createLoan(); $event.preventDefault()">
        @if (store.error()) {
          <p-message severity="error" styleClass="w-full" role="alert">{{ store.error() }}</p-message>
        }

        @if (store.availableClients().length === 0) {
          <p-message severity="warn" styleClass="w-full">No hay clientes disponibles sin un préstamo vigente.</p-message>
        }

        <div>
          <label for="loan-client" class="mb-2 block text-sm font-medium text-color">Cliente</label>
          <p-select
            inputId="loan-client"
            [formField]="loanForm.clientId"
            [options]="clientOptions()"
            optionLabel="label"
            optionValue="value"
            placeholder="Selecciona un cliente"
            appendTo="body"
            styleClass="w-full"
            [filter]="true"
            filterBy="label"
          />
          @if (loanForm.clientId().touched() && loanForm.clientId().invalid()) {
            <small class="mt-1 block text-red-600">{{ loanForm.clientId().errors()[0]?.message }}</small>
          }
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <label for="loan-principal" class="mb-2 block text-sm font-medium text-color">Capital</label>
            <p-inputnumber
              inputId="loan-principal"
              [formField]="loanForm.principal"
              mode="currency"
              currency="PEN"
              locale="es-PE"
              styleClass="w-full"
            />
            @if (loanForm.principal().touched() && loanForm.principal().invalid()) {
              <small class="mt-1 block text-red-600">{{ loanForm.principal().errors()[0]?.message }}</small>
            }
          </div>
          <div>
            <label for="loan-interest" class="mb-2 block text-sm font-medium text-color">Tasa de interés</label>
            <p-inputnumber
              inputId="loan-interest"
              [formField]="loanForm.interestRate"
              suffix="%"
              [maxFractionDigits]="4"
              styleClass="w-full"
            />
            @if (loanForm.interestRate().touched() && loanForm.interestRate().invalid()) {
              <small class="mt-1 block text-red-600">{{ loanForm.interestRate().errors()[0]?.message }}</small>
            }
          </div>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <label for="loan-frequency" class="mb-2 block text-sm font-medium text-color">Frecuencia</label>
            <p-select
              inputId="loan-frequency"
              [formField]="loanForm.frequency"
              [options]="frequencyOptions"
              optionLabel="label"
              optionValue="value"
              appendTo="body"
              styleClass="w-full"
            />
          </div>
          <div>
            <label for="loan-count" class="mb-2 block text-sm font-medium text-color">Cantidad de cuotas</label>
            <p-inputnumber
              inputId="loan-count"
              [formField]="loanForm.installmentCount"
              [useGrouping]="false"
              styleClass="w-full"
            />
            @if (loanForm.installmentCount().touched() && loanForm.installmentCount().invalid()) {
              <small class="mt-1 block text-red-600">{{ loanForm.installmentCount().errors()[0]?.message }}</small>
            }
          </div>
        </div>

        <div>
          <label for="loan-start" class="mb-2 block text-sm font-medium text-color">Fecha de inicio</label>
          <input
            id="loan-start"
            type="date"
            class="w-full rounded-md border border-surface px-3 py-2.5 text-color outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 dark:bg-surface-950"
            [formField]="loanForm.startedOn"
          />
          @if (loanForm.startedOn().touched() && loanForm.startedOn().invalid()) {
            <small class="mt-1 block text-red-600">{{ loanForm.startedOn().errors()[0]?.message }}</small>
          }
        </div>

        <section class="grid grid-cols-2 gap-3 rounded-xl border border-surface bg-surface-50 p-4 text-sm dark:bg-surface-800 sm:grid-cols-3" aria-label="Resumen del préstamo">
          <div>
            <p class="text-muted-color">Total</p>
            <p class="mt-1 font-semibold">{{ summary().totalAmount | currency: 'PEN' : 'symbol' : '1.2-2' : 'es-PE' }}</p>
          </div>
          <div>
            <p class="text-muted-color">Cuota base</p>
            <p class="mt-1 font-semibold text-primary">{{ summary().baseInstallmentAmount | currency: 'PEN' : 'symbol' : '1.2-2' : 'es-PE' }}</p>
          </div>
          <div class="col-span-2 sm:col-span-1">
            <p class="text-muted-color">Primer pago</p>
            <p class="mt-1 font-semibold">{{ formatDate(firstDueDate()) }}</p>
          </div>
        </section>

        <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <p-button
            type="button"
            label="Cancelar"
            severity="secondary"
            variant="text"
            styleClass="w-full sm:w-auto"
            (onClick)="createDialogVisible.set(false)"
          />
          <p-button
            type="submit"
            label="Crear préstamo"
            icon="pi pi-check"
            styleClass="w-full sm:w-auto"
            [loading]="store.creating()"
            [disabled]="loanForm().invalid() || store.availableClients().length === 0"
          />
        </div>
      </form>
    </p-dialog>
  `,
})
export default class Loans {
  protected readonly store = inject(LoansStore);
  private readonly messageService = inject(MessageService);

  protected readonly loadingRows = [1, 2, 3];
  protected readonly createDialogVisible = signal(false);
  protected readonly frequencyOptions: Array<{ label: string; value: LoanFrequency }> = [
    { label: 'Diario', value: 'daily' },
    { label: 'Semanal', value: 'weekly' },
    { label: 'Mensual', value: 'monthly' },
  ];

  protected readonly loanModel = signal<LoanFormModel>(emptyModel());
  protected readonly loanForm = form(this.loanModel, (path) => {
    required(path.clientId, { message: 'Selecciona un cliente.' });
    min(path.principal, 0.01, { message: 'El capital debe ser mayor que cero.' });
    min(path.interestRate, 0, { message: 'La tasa no puede ser negativa.' });
    min(path.installmentCount, 1, { message: 'Debe existir al menos una cuota.' });
    max(path.installmentCount, 32767, { message: 'La cantidad de cuotas es demasiado alta.' });
    required(path.startedOn, { message: 'Selecciona la fecha de inicio.' });
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
    const model = this.loanModel();
    return calculateLoanSummary(model.principal, model.interestRate, model.installmentCount);
  });
  protected readonly firstDueDate = computed(() => {
    const model = this.loanModel();
    return firstDueOn(model.startedOn, model.frequency);
  });
  protected readonly clientOptions = computed(() =>
    this.store.availableClients().map((client) => ({
      label: `${client.dni} · ${client.fullName} — ${client.collectorName}`,
      value: client.id,
    })),
  );

  constructor() {
    void this.store.load();
  }

  protected openCreateDialog(): void {
    this.store.clearError();
    this.loanModel.set(emptyModel());
    this.loanForm().reset();
    this.createDialogVisible.set(true);
  }

  protected createLoan(): void {
    void submit(this.loanForm, async () => {
      const model = this.loanModel();
      const created = await this.store.create({
        clientId: model.clientId,
        principal: model.principal,
        interestRate: model.interestRate,
        frequency: model.frequency,
        installmentCount: model.installmentCount,
        startedOn: model.startedOn,
        firstDueOn: firstDueOn(model.startedOn, model.frequency),
      });

      if (created) {
        this.createDialogVisible.set(false);
        this.messageService.add({
          severity: 'success',
          summary: 'Préstamo creado',
          detail: 'El préstamo y su cronograma fueron registrados correctamente.',
        });
      }
    });
  }

  protected frequencyLabel(frequency: LoanFrequency): string {
    return this.frequencyOptions.find((option) => option.value === frequency)?.label ?? frequency;
  }

  protected statusLabel(status: LoanStatus): string {
    return { active: 'Activo', paid: 'Pagado', renewed: 'Renovado', voided: 'Anulado' }[status];
  }

  protected formatDate(value: string): string {
    if (!value) return '—';
    return new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium' }).format(new Date(`${value}T00:00:00`));
  }
}
