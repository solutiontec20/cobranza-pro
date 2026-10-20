import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import {
  form,
  FormField,
  max,
  maxLength,
  min,
  required,
  submit,
  validate,
} from '@angular/forms/signals';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { SkeletonModule } from 'primeng/skeleton';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import {
  LoanFrequency,
  LoanInstallmentStatus,
  LoanListItem,
  LoanStatus,
} from '../../../core/models/loan.model';
import { calculateLoanSummary, firstDueOn, toDateInput } from './loan-calculations';
import { LoansStore } from './loans.store';

interface LoanFormModel {
  clientId: string;
  principal: number;
  interestRate: number;
  frequency: LoanFrequency;
  installmentCount: number;
  startedOn: string;
  reason: string;
}

type LoanDialogMode = 'create' | 'edit';
type InstallmentSeverity = 'success' | 'warn' | 'danger' | 'secondary';

const emptyModel = (): LoanFormModel => ({
  clientId: '',
  principal: 100,
  interestRate: 20,
  frequency: 'daily',
  installmentCount: 24,
  startedOn: toDateInput(new Date()),
  reason: '',
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
            Crea créditos y consulta capital, cuotas y saldo con información de Supabase.
          </p>
        </div>
        <p-button label="Nuevo préstamo" icon="pi pi-plus" [disabled]="store.loading()" (onClick)="openCreateDialog()" />
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
              Crea el primero para un cliente activo sin crédito vigente.
            </p>
          </div>
        } @else {
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
                <th>Tasa</th>
                <th>Total</th>
                <th>Cuota</th>
                <th>Saldo</th>
                <th>Frecuencia</th>
                <th>Estado</th>
                <th class="text-right">Acciones</th>
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
                <td>{{ loan.interestRate }}%</td>
                <td class="font-semibold">{{ loan.totalAmount | currency: 'PEN' : 'symbol' : '1.2-2' : 'es-PE' }}</td>
                <td>{{ loan.installmentAmount | currency: 'PEN' : 'symbol' : '1.2-2' : 'es-PE' }}</td>
                <td class="font-semibold" [class.text-red-600]="loan.balance > 0">
                  {{ loan.balance | currency: 'PEN' : 'symbol' : '1.2-2' : 'es-PE' }}
                </td>
                <td><p-tag severity="secondary" [value]="frequencyLabel(loan.frequency)" /></td>
                <td><p-tag [severity]="loan.status === 'active' ? 'success' : 'secondary'" [value]="statusLabel(loan.status)" /></td>
                <td>
                  <div class="flex justify-end gap-1">
                    <p-button
                      label="Cronograma"
                      icon="pi pi-calendar"
                      size="small"
                      severity="secondary"
                      variant="text"
                      [ariaLabel]="'Ver cronograma de ' + loan.clientName"
                      (onClick)="openSchedule(loan)"
                    />
                    <p-button
                      label="Editar"
                      icon="pi pi-pencil"
                      size="small"
                      variant="text"
                      [disabled]="!canEdit(loan)"
                      [title]="editEligibilityMessage(loan)"
                      [ariaLabel]="'Editar préstamo de ' + loan.clientName"
                      (onClick)="openEditDialog(loan)"
                    />
                  </div>
                </td>
              </tr>
            </ng-template>
          </p-table>
        }
      </section>
    </main>

    <p-dialog
      [header]="loanDialogTitle()"
      [modal]="true"
      [visible]="loanDialogVisible()"
      (visibleChange)="loanDialogVisible.set($event)"
      styleClass="w-[calc(100vw-2rem)] max-w-2xl"
    >
      <form class="flex flex-col gap-5" (submit)="saveLoan(); $event.preventDefault()">
        @if (store.error()) {
          <p-message severity="error" styleClass="w-full" role="alert">{{ store.error() }}</p-message>
        }

        @if (dialogMode() === 'create') {
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
        } @else if (editingLoan()) {
          <p-message severity="info" styleClass="w-full">
            Solo se pueden guardar cambios mientras el préstamo esté activo y no tenga historial de pagos.
          </p-message>
          <section class="rounded-xl border border-surface bg-surface-50 p-4 dark:bg-surface-800" aria-label="Cliente del préstamo">
            <p class="text-xs font-semibold uppercase tracking-wide text-muted-color">Cliente</p>
            <p class="mt-1 font-semibold text-color">{{ editingLoan()?.clientName }}</p>
            <p class="text-sm text-muted-color">Cobrador: {{ editingLoan()?.collectorName }}</p>
          </section>
        }

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
          <input
            id="loan-start"
            type="date"
            class="w-full rounded-md border border-surface px-3 py-2 text-color outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 dark:bg-surface-950"
            [formField]="loanForm.startedOn"
          />
          @if (loanForm.startedOn().touched() && loanForm.startedOn().invalid()) {
            <small class="mt-1 block text-red-600">{{ loanForm.startedOn().errors()[0]?.message }}</small>
          }
        </div>

        @if (dialogMode() === 'edit') {
          <div>
            <label for="loan-reason" class="mb-2 block text-sm font-medium text-color">Motivo de la edición</label>
            <textarea
              id="loan-reason"
              rows="3"
              class="w-full resize-y rounded-md border border-surface px-3 py-2 text-color outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 dark:bg-surface-950"
              placeholder="Describe por qué se corrigen las condiciones del préstamo"
              [formField]="loanForm.reason"
            ></textarea>
            @if (loanForm.reason().touched() && loanForm.reason().invalid()) {
              <small class="mt-1 block text-red-600">{{ loanForm.reason().errors()[0]?.message }}</small>
            }
          </div>
        }

        <section class="grid gap-3 rounded-xl border border-surface bg-surface-50 p-4 text-sm dark:bg-surface-800 sm:grid-cols-3" aria-label="Resumen del préstamo">
          <div>
            <p class="text-muted-color">Total a pagar</p>
            <p class="mt-1 text-lg font-semibold">{{ summary().totalAmount | currency: 'PEN' : 'symbol' : '1.2-2' : 'es-PE' }}</p>
          </div>
          <div>
            <p class="text-muted-color">Cuota base</p>
            <p class="mt-1 text-lg font-semibold text-primary">{{ summary().baseInstallmentAmount | currency: 'PEN' : 'symbol' : '1.2-2' : 'es-PE' }}</p>
          </div>
          <div>
            <p class="text-muted-color">Primera fecha de pago</p>
            <p class="mt-1 text-lg font-semibold">{{ formatDate(firstDueDate()) }}</p>
          </div>
        </section>

        <div class="flex justify-end gap-2">
          <p-button type="button" label="Cancelar" severity="secondary" variant="text" (onClick)="loanDialogVisible.set(false)" />
          <p-button
            type="submit"
            [label]="dialogMode() === 'create' ? 'Crear préstamo' : 'Guardar cambios'"
            icon="pi pi-check"
            [loading]="dialogMode() === 'create' ? store.creating() : store.saving()"
            [disabled]="loanForm().invalid() || (dialogMode() === 'create' && store.availableClients().length === 0)"
          />
        </div>
      </form>
    </p-dialog>

    <p-dialog
      header="Cronograma de pagos"
      [modal]="true"
      [visible]="scheduleDialogVisible()"
      (visibleChange)="scheduleDialogVisible.set($event)"
      styleClass="w-[calc(100vw-2rem)] max-w-6xl"
    >
      @if (selectedLoan()) {
        <div class="mb-5 flex flex-col gap-1">
          <p class="text-lg font-semibold text-color">{{ selectedLoan()?.clientName }}</p>
          <p class="text-sm text-muted-color">
            {{ frequencyLabel(selectedLoan()!.frequency) }} · {{ selectedLoan()?.installmentCount }} cuotas
          </p>
        </div>

        @if (store.error()) {
          <p-message severity="error" styleClass="mb-5 w-full" role="alert">{{ store.error() }}</p-message>
        }

        <section class="mb-5 grid gap-3 rounded-xl border border-surface bg-surface-50 p-4 text-sm dark:bg-surface-800 sm:grid-cols-2 lg:grid-cols-4" aria-label="Resumen del préstamo">
          <div><p class="text-muted-color">Capital</p><p class="mt-1 font-semibold">{{ selectedLoan()?.principal | currency: 'PEN' : 'symbol' : '1.2-2' : 'es-PE' }}</p></div>
          <div><p class="text-muted-color">Interés</p><p class="mt-1 font-semibold">{{ scheduleInterest() | currency: 'PEN' : 'symbol' : '1.2-2' : 'es-PE' }} ({{ selectedLoan()?.interestRate }}%)</p></div>
          <div><p class="text-muted-color">Total</p><p class="mt-1 font-semibold">{{ selectedLoan()?.totalAmount | currency: 'PEN' : 'symbol' : '1.2-2' : 'es-PE' }}</p></div>
          <div><p class="text-muted-color">Cuota</p><p class="mt-1 font-semibold text-primary">{{ selectedLoan()?.installmentAmount | currency: 'PEN' : 'symbol' : '1.2-2' : 'es-PE' }}</p></div>
          <div><p class="text-muted-color">Pagado</p><p class="mt-1 font-semibold text-green-600">{{ schedulePaid() | currency: 'PEN' : 'symbol' : '1.2-2' : 'es-PE' }}</p></div>
          <div><p class="text-muted-color">Saldo</p><p class="mt-1 font-semibold text-red-600">{{ scheduleBalance() | currency: 'PEN' : 'symbol' : '1.2-2' : 'es-PE' }}</p></div>
          <div><p class="text-muted-color">Fecha de inicio</p><p class="mt-1 font-semibold">{{ formatDate(selectedLoan()!.startedOn) }}</p></div>
          <div><p class="text-muted-color">Fecha de fin</p><p class="mt-1 font-semibold">{{ formatDate(scheduleEndDate()) }}</p></div>
        </section>

        @if (store.loadingSchedule()) {
          <div class="space-y-3" aria-label="Cargando cronograma" aria-live="polite">
            @for (row of loadingRows; track row) {
              <p-skeleton height="3.5rem" borderRadius="0.75rem" />
            }
          </div>
        } @else if (store.selectedSchedule().length === 0) {
          <div class="rounded-xl border border-dashed border-surface px-6 py-10 text-center text-muted-color">
            No se encontraron cuotas activas para este préstamo.
          </div>
        } @else {
          <p-table [value]="store.selectedSchedule()" responsiveLayout="scroll" styleClass="p-datatable-sm">
            <ng-template #header>
              <tr>
                <th>N.°</th>
                <th>Vencimiento</th>
                <th class="text-right">Esperado</th>
                <th class="text-right">Pagado</th>
                <th class="text-right">Saldo</th>
                <th>Estado</th>
              </tr>
            </ng-template>
            <ng-template #body let-installment>
              <tr>
                <td class="font-semibold">{{ installment.installmentNumber }}</td>
                <td>{{ formatDate(installment.dueDate) }}</td>
                <td class="text-right">{{ installment.scheduledAmount | currency: 'PEN' : 'symbol' : '1.2-2' : 'es-PE' }}</td>
                <td class="text-right">{{ installment.paidAmount | currency: 'PEN' : 'symbol' : '1.2-2' : 'es-PE' }}</td>
                <td class="text-right font-semibold">{{ installment.outstandingAmount | currency: 'PEN' : 'symbol' : '1.2-2' : 'es-PE' }}</td>
                <td>
                  <p-tag [severity]="installmentSeverity(installment.status)" [value]="installmentStatusLabel(installment.status)" />
                  @if (installment.overdueDays > 0) {
                    <small class="ml-2 text-red-600">{{ installment.overdueDays }} días</small>
                  }
                </td>
              </tr>
            </ng-template>
          </p-table>
        }
      }
    </p-dialog>
  `,
})
export default class Loans {
  protected readonly store = inject(LoansStore);
  private readonly messageService = inject(MessageService);

  protected readonly loadingRows = [1, 2, 3];
  protected readonly loanDialogVisible = signal(false);
  protected readonly scheduleDialogVisible = signal(false);
  protected readonly dialogMode = signal<LoanDialogMode>('create');
  protected readonly editingLoan = signal<LoanListItem | null>(null);
  protected readonly selectedLoan = signal<LoanListItem | null>(null);
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
    required(path.reason, {
      message: 'Ingresa el motivo de la edición.',
      when: () => this.dialogMode() === 'edit',
    });
    maxLength(path.reason, 500, { message: 'El motivo no puede superar 500 caracteres.' });
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
  protected readonly loanDialogTitle = computed(() =>
    this.dialogMode() === 'create' ? 'Nuevo préstamo' : 'Editar préstamo',
  );
  protected readonly clientOptions = computed(() =>
    this.store.availableClients().map((client) => ({
      label: `${client.dni} · ${client.fullName} — ${client.collectorName}`,
      value: client.id,
    })),
  );
  protected readonly scheduleInterest = computed(() => {
    const loan = this.selectedLoan();
    return loan ? loan.totalAmount - loan.principal : 0;
  });
  protected readonly schedulePaid = computed(() =>
    this.store.selectedSchedule().length > 0
      ? this.store.selectedSchedule().reduce((total, item) => total + item.paidAmount, 0)
      : (this.selectedLoan()?.totalAmount ?? 0) - (this.selectedLoan()?.balance ?? 0),
  );
  protected readonly scheduleBalance = computed(() =>
    this.store.selectedSchedule().length > 0
      ? this.store.selectedSchedule().reduce((total, item) => total + item.outstandingAmount, 0)
      : (this.selectedLoan()?.balance ?? 0),
  );
  protected readonly scheduleEndDate = computed(() => {
    const schedule = this.store.selectedSchedule();
    return schedule.at(-1)?.dueDate ?? this.selectedLoan()?.endDate ?? '';
  });

  constructor() {
    void this.store.load();
  }

  protected openCreateDialog(): void {
    this.store.clearError();
    this.dialogMode.set('create');
    this.editingLoan.set(null);
    this.loanModel.set(emptyModel());
    this.loanForm().reset();
    this.loanDialogVisible.set(true);
  }

  protected openEditDialog(loan: LoanListItem): void {
    if (!this.canEdit(loan)) return;

    this.store.clearError();
    this.dialogMode.set('edit');
    this.editingLoan.set(loan);
    this.loanModel.set({
      clientId: loan.clientId,
      principal: loan.principal,
      interestRate: loan.interestRate,
      frequency: loan.frequency,
      installmentCount: loan.installmentCount,
      startedOn: loan.startedOn,
      reason: '',
    });
    this.loanForm().reset();
    this.loanDialogVisible.set(true);
  }

  protected openSchedule(loan: LoanListItem): void {
    this.store.clearError();
    this.selectedLoan.set(loan);
    this.scheduleDialogVisible.set(true);
    void this.store.loadSchedule(loan.id);
  }

  protected saveLoan(): void {
    void submit(this.loanForm, async () => {
      const model = this.loanModel();

      if (this.dialogMode() === 'create') {
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
          this.loanDialogVisible.set(false);
          this.messageService.add({
            severity: 'success',
            summary: 'Préstamo creado',
            detail: 'El préstamo y su cronograma fueron registrados correctamente.',
          });
        }
        return;
      }

      const loan = this.editingLoan();
      if (!loan) return;

      const updated = await this.store.update({
        loanId: loan.id,
        principal: model.principal,
        interestRate: model.interestRate,
        frequency: model.frequency,
        installmentCount: model.installmentCount,
        startedOn: model.startedOn,
        reason: model.reason.trim(),
      });

      if (updated) {
        const refreshedLoan = this.store.loans().find((item) => item.id === loan.id);
        if (refreshedLoan && this.selectedLoan()?.id === loan.id) {
          this.selectedLoan.set(refreshedLoan);
        }
        this.loanDialogVisible.set(false);
        this.messageService.add({
          severity: 'success',
          summary: 'Préstamo actualizado',
          detail: 'Las condiciones y el cronograma fueron recalculados correctamente.',
        });
      }
    });
  }

  protected canEdit(loan: LoanListItem): boolean {
    return loan.status === 'active' && Math.abs(loan.balance - loan.totalAmount) < 0.005;
  }

  protected editEligibilityMessage(loan: LoanListItem): string {
    if (loan.status !== 'active') return 'Solo se pueden editar préstamos activos.';
    if (!this.canEdit(loan)) return 'No se puede editar porque el préstamo ya registra pagos.';
    return 'Editar préstamo';
  }

  protected frequencyLabel(frequency: LoanFrequency): string {
    return this.frequencyOptions.find((option) => option.value === frequency)?.label ?? frequency;
  }

  protected statusLabel(status: LoanStatus): string {
    return { active: 'Activo', paid: 'Pagado', renewed: 'Renovado', voided: 'Anulado' }[status];
  }

  protected installmentStatusLabel(status: LoanInstallmentStatus): string {
    return { pending: 'Pendiente', partial: 'Pago parcial', overdue: 'Vencido', paid: 'Pagado' }[status];
  }

  protected installmentSeverity(status: LoanInstallmentStatus): InstallmentSeverity {
    return { pending: 'secondary', partial: 'warn', overdue: 'danger', paid: 'success' }[status] as InstallmentSeverity;
  }

  protected formatDate(value: string): string {
    if (!value) return '—';
    return new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium' }).format(new Date(`${value}T00:00:00`));
  }
}
