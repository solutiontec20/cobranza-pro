import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { form, FormField, max, min, required, submit, validate } from '@angular/forms/signals';
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
    SelectModule,
    SkeletonModule,
    TableModule,
    TagModule,
  ],
  template: `
    <main class="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 sm:p-6" aria-labelledby="loans-title">
      <header class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p class="mb-1 text-sm font-medium text-primary">Créditos</p>
          <h1 id="loans-title" class="text-2xl font-bold text-color sm:text-3xl">Préstamos</h1>
          <p class="mt-1 text-sm text-muted-color">
            Creá créditos y consultá capital, cuotas y saldo con información de Supabase.
          </p>
        </div>
        <p-button label="Nuevo préstamo" icon="pi pi-plus" [disabled]="store.loading()" (onClick)="openDialog()" />
      </header>

      @if (store.error()) {
        <p-message severity="error" styleClass="w-full" role="alert">{{ store.error() }}</p-message>
      }

      <section class="overflow-hidden rounded-xl border border-surface bg-surface-0 shadow-sm dark:bg-surface-900">
        @if (store.loading()) {
          <div class="space-y-3 p-4" aria-label="Cargando préstamos">
            @for (row of loadingRows; track row) {
              <p-skeleton height="4rem" borderRadius="0.75rem" />
            }
          </div>
        } @else if (store.loans().length === 0) {
          <div class="flex flex-col items-center px-6 py-14 text-center">
            <i class="pi pi-wallet mb-4 text-4xl text-muted-color" aria-hidden="true"></i>
            <h2 class="text-lg font-semibold text-color">Todavía no hay préstamos</h2>
            <p class="mt-1 text-sm text-muted-color">
              Creá el primero para un cliente activo sin crédito vigente.
            </p>
          </div>
        } @else {
          <p-table [value]="store.loans()" [rows]="10" [paginator]="store.loans().length > 10" responsiveLayout="scroll" styleClass="p-datatable-sm">
            <ng-template #header>
              <tr>
                <th>Cliente</th><th>Cobrador</th><th>Capital</th><th>Tasa</th><th>Total</th>
                <th>Primera cuota</th><th>Saldo</th><th>Frecuencia</th><th>Estado</th>
              </tr>
            </ng-template>
            <ng-template #body let-loan>
              <tr>
                <td><span class="font-semibold">{{ loan.clientName }}</span><br><small class="text-muted-color">{{ formatDate(loan.startedOn) }}</small></td>
                <td>{{ loan.collectorName }}</td>
                <td>{{ loan.principal | currency: 'PEN' : 'symbol' : '1.2-2' : 'es-PE' }}</td>
                <td>{{ loan.interestRate }}%</td>
                <td class="font-semibold">{{ loan.totalAmount | currency: 'PEN' : 'symbol' : '1.2-2' : 'es-PE' }}</td>
                <td>{{ loan.installmentAmount | currency: 'PEN' : 'symbol' : '1.2-2' : 'es-PE' }}</td>
                <td class="font-semibold" [class.text-red-600]="loan.balance > 0">{{ loan.balance | currency: 'PEN' : 'symbol' : '1.2-2' : 'es-PE' }}</td>
                <td><p-tag severity="secondary" [value]="frequencyLabel(loan.frequency)" /></td>
                <td><p-tag [severity]="loan.status === 'active' ? 'success' : 'secondary'" [value]="statusLabel(loan.status)" /></td>
              </tr>
            </ng-template>
          </p-table>
        }
      </section>
    </main>

    @defer (when dialogVisible()) {
    <p-dialog header="Nuevo préstamo" [modal]="true" [visible]="dialogVisible()" (visibleChange)="dialogVisible.set($event)" styleClass="w-[calc(100vw-2rem)] max-w-2xl">
      <form class="flex flex-col gap-5" (submit)="createLoan(); $event.preventDefault()">
        @if (store.availableClients().length === 0) {
          <p-message severity="warn" styleClass="w-full">No hay clientes disponibles sin un préstamo vigente.</p-message>
        }

        <div>
          <label for="loan-client" class="mb-2 block text-sm font-medium text-color">Cliente</label>
          <p-select inputId="loan-client" [formField]="loanForm.clientId" [options]="clientOptions()" optionLabel="label" optionValue="value" placeholder="Seleccioná un cliente" appendTo="body" styleClass="w-full" [filter]="true" filterBy="label" />
          @if (loanForm.clientId().touched() && loanForm.clientId().invalid()) {
            <small class="mt-1 block text-red-600">{{ loanForm.clientId().errors()[0]?.message }}</small>
          }
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <label for="loan-principal" class="mb-2 block text-sm font-medium text-color">Capital</label>
            <p-inputnumber inputId="loan-principal" [formField]="loanForm.principal" mode="currency" currency="PEN" locale="es-PE" styleClass="w-full" />
            @if (loanForm.principal().touched() && loanForm.principal().invalid()) {
              <small class="mt-1 block text-red-600">{{ loanForm.principal().errors()[0]?.message }}</small>
            }
          </div>
          <div>
            <label for="loan-interest" class="mb-2 block text-sm font-medium text-color">Tasa de interés</label>
            <p-inputnumber inputId="loan-interest" [formField]="loanForm.interestRate" suffix="%" [maxFractionDigits]="4" styleClass="w-full" />
            @if (loanForm.interestRate().touched() && loanForm.interestRate().invalid()) {
              <small class="mt-1 block text-red-600">{{ loanForm.interestRate().errors()[0]?.message }}</small>
            }
          </div>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <label for="loan-frequency" class="mb-2 block text-sm font-medium text-color">Frecuencia</label>
            <p-select inputId="loan-frequency" [formField]="loanForm.frequency" [options]="frequencyOptions" optionLabel="label" optionValue="value" appendTo="body" styleClass="w-full" />
          </div>
          <div>
            <label for="loan-count" class="mb-2 block text-sm font-medium text-color">Cantidad de cuotas</label>
            <p-inputnumber inputId="loan-count" [formField]="loanForm.installmentCount" [useGrouping]="false" styleClass="w-full" />
            @if (loanForm.installmentCount().touched() && loanForm.installmentCount().invalid()) {
              <small class="mt-1 block text-red-600">{{ loanForm.installmentCount().errors()[0]?.message }}</small>
            }
          </div>
        </div>

        <div>
          <label for="loan-start" class="mb-2 block text-sm font-medium text-color">Fecha de inicio</label>
          <input id="loan-start" type="date" class="w-full rounded-md border border-surface px-3 py-2 text-color outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 dark:bg-surface-950" [formField]="loanForm.startedOn" />
          @if (loanForm.startedOn().touched() && loanForm.startedOn().invalid()) {
            <small class="mt-1 block text-red-600">{{ loanForm.startedOn().errors()[0]?.message }}</small>
          }
        </div>

        <section class="grid gap-3 rounded-xl border border-surface bg-surface-50 p-4 text-sm dark:bg-surface-800 sm:grid-cols-3" aria-label="Resumen del préstamo">
          <div><p class="text-muted-color">Total a pagar</p><p class="mt-1 text-lg font-semibold">{{ summary().totalAmount | currency: 'PEN' : 'symbol' : '1.2-2' : 'es-PE' }}</p></div>
          <div><p class="text-muted-color">Cuota base</p><p class="mt-1 text-lg font-semibold text-primary">{{ summary().baseInstallmentAmount | currency: 'PEN' : 'symbol' : '1.2-2' : 'es-PE' }}</p></div>
          <div><p class="text-muted-color">Primera fecha de pago</p><p class="mt-1 text-lg font-semibold">{{ formatDate(firstDueDate()) }}</p></div>
        </section>

        <div class="flex justify-end gap-2">
          <p-button type="button" label="Cancelar" severity="secondary" variant="text" (onClick)="dialogVisible.set(false)" />
          <p-button type="submit" label="Crear préstamo" icon="pi pi-check" [loading]="store.creating()" [disabled]="loanForm().invalid() || store.availableClients().length === 0" />
        </div>
      </form>
    </p-dialog>
    } @error {
      <p-message severity="error" styleClass="w-full">No se pudo cargar el formulario de nuevo préstamo.</p-message>
    }
  `,
})
export default class Loans {
  protected readonly store = inject(LoansStore);
  private readonly messageService = inject(MessageService);
  protected readonly loadingRows = [1, 2, 3];
  protected readonly dialogVisible = signal(false);
  protected readonly frequencyOptions: Array<{ label: string; value: LoanFrequency }> = [
    { label: 'Diario', value: 'daily' },
    { label: 'Semanal', value: 'weekly' },
    { label: 'Mensual', value: 'monthly' },
  ];

  protected readonly loanModel = signal<LoanFormModel>(emptyModel());
  protected readonly loanForm = form(this.loanModel, (path) => {
    required(path.clientId, { message: 'Seleccioná un cliente.' });
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

  protected openDialog(): void {
    this.store.clearError();
    this.loanModel.set(emptyModel());
    this.loanForm().reset();
    this.dialogVisible.set(true);
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
        this.dialogVisible.set(false);
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
