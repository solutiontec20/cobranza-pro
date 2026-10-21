import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { form, FormField, max, maxLength, min, required, submit, validate } from '@angular/forms/signals';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { SkeletonModule } from 'primeng/skeleton';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import {
  LoanFrequency,
  LoanInstallmentStatus,
  LoanPaymentRecord,
  LoanStatus,
} from '../../../core/models/loan.model';
import { calculateLoanSummary, firstDueOn } from './loan-calculations';
import { LoansStore } from './loans.store';

interface LoanEditModel {
  principal: number;
  interestRate: number;
  frequency: LoanFrequency;
  installmentCount: number;
  startedOn: string;
  reason: string;
}

type TagSeverity = 'success' | 'warn' | 'danger' | 'secondary' | 'info';

const emptyEditModel = (): LoanEditModel => ({
  principal: 0,
  interestRate: 0,
  frequency: 'daily',
  installmentCount: 1,
  startedOn: '',
  reason: '',
});

@Component({
  selector: 'app-admin-loan-detail',
  imports: [
    ButtonModule,
    CurrencyPipe,
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
    <main class="mx-auto flex w-full max-w-6xl flex-col gap-4 p-3 pb-10 sm:gap-6 sm:p-6" aria-labelledby="loan-detail-title">
      <nav aria-label="Navegación del préstamo">
        <a
          routerLink="/admin/prestamos"
          class="inline-flex min-h-10 items-center gap-2 rounded-md px-2 py-2 font-semibold text-primary outline-none hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary"
        >
          <i class="pi pi-arrow-left" aria-hidden="true"></i>
          Volver a préstamos
        </a>
      </nav>

      @if (store.error()) {
        <p-message severity="error" styleClass="w-full" role="alert">{{ store.error() }}</p-message>
      }

      @if (store.loadingDetail()) {
        <section class="space-y-4" aria-label="Cargando detalle del préstamo" aria-live="polite">
          <p-skeleton height="9rem" borderRadius="0.75rem" />
          <p-skeleton height="15rem" borderRadius="0.75rem" />
          <p-skeleton height="18rem" borderRadius="0.75rem" />
        </section>
      } @else if (detail(); as detail) {
        <header class="flex flex-col gap-4 border-b border-surface pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div class="min-w-0">
            <div class="mb-2 flex flex-wrap items-center gap-2">
              <p-tag [severity]="loanStatusSeverity(detail.loan.status)" [value]="loanStatusLabel(detail.loan.status)" />
              <span class="text-sm text-muted-color">Préstamo de {{ frequencyLabel(detail.loan.frequency).toLowerCase() }}</span>
            </div>
            <h1 id="loan-detail-title" class="break-words text-2xl font-bold text-color sm:text-3xl">
              {{ detail.client.fullName }}
            </h1>
            <p class="mt-1 text-sm text-muted-color">DNI {{ detail.client.dni }} · {{ detail.loan.installmentCount }} cuotas</p>
          </div>

          @if (canEdit() && !editing()) {
            <p-button
              label="Editar préstamo"
              icon="pi pi-pencil"
              styleClass="w-full sm:w-auto"
              (onClick)="startEditing()"
            />
          }
        </header>

        <div class="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.35fr)]">
          <section class="rounded-xl border border-surface bg-surface-0 p-4 shadow-sm dark:bg-surface-900 sm:p-5" aria-labelledby="client-summary-title">
            <div class="flex items-start gap-3">
              <div class="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary" aria-hidden="true">
                {{ clientInitials() }}
              </div>
              <div class="min-w-0">
                <h2 id="client-summary-title" class="text-lg font-semibold text-color">Detalle del cliente</h2>
                <p class="text-sm text-muted-color">Información de contacto y cobranza</p>
              </div>
            </div>

            <dl class="mt-5 divide-y divide-surface-200 text-sm dark:divide-surface-700">
              <div class="grid gap-1 py-3 sm:grid-cols-[7rem_1fr]">
                <dt class="text-muted-color">Teléfono</dt>
                <dd class="font-medium text-color">
                  @if (detail.client.phone) {
                    <a class="rounded text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-primary" [href]="'tel:' + detail.client.phone">
                      {{ detail.client.phone }}
                    </a>
                  } @else {
                    No registrado
                  }
                </dd>
              </div>
              <div class="grid gap-1 py-3 sm:grid-cols-[7rem_1fr]">
                <dt class="text-muted-color">Dirección</dt>
                <dd class="font-medium text-color">{{ detail.client.address || 'No registrada' }}</dd>
              </div>
              <div class="grid gap-1 py-3 sm:grid-cols-[7rem_1fr]">
                <dt class="text-muted-color">Cobrador</dt>
                <dd class="font-medium text-color">{{ detail.client.collectorName }}</dd>
              </div>
              @if (detail.client.notes) {
                <div class="grid gap-1 py-3 sm:grid-cols-[7rem_1fr]">
                  <dt class="text-muted-color">Observaciones</dt>
                  <dd class="whitespace-pre-line text-color">{{ detail.client.notes }}</dd>
                </div>
              }
            </dl>
          </section>

          <section class="overflow-hidden rounded-xl border border-surface bg-surface-0 shadow-sm dark:bg-surface-900" aria-labelledby="loan-summary-title">
            <div class="border-b border-surface p-4 sm:p-5">
              <div class="flex flex-col items-start justify-between gap-1 sm:flex-row sm:items-center sm:gap-3">
                <h2 id="loan-summary-title" class="text-lg font-semibold text-color">Resumen del préstamo</h2>
                <span class="text-sm text-muted-color">{{ formatDate(detail.loan.startedOn) }} — {{ formatDate(detail.loan.endDate) }}</span>
              </div>

              <div class="mt-5 flex flex-col gap-1">
                <span class="text-sm text-muted-color">Saldo pendiente</span>
                <span class="text-3xl font-bold tracking-tight text-color sm:text-4xl">
                  {{ detail.loan.balance | currency: 'PEN' : 'symbol' : '1.2-2' : 'es-PE' }}
                </span>
                <span class="text-sm text-muted-color">
                  Pagado {{ totalPaid() | currency: 'PEN' : 'symbol' : '1.2-2' : 'es-PE' }} de
                  {{ detail.loan.totalAmount | currency: 'PEN' : 'symbol' : '1.2-2' : 'es-PE' }}
                </span>
              </div>

              <div class="mt-4 h-2 overflow-hidden rounded-full bg-surface-200 dark:bg-surface-700" aria-hidden="true">
                <div class="h-full rounded-full bg-primary" [style.width.%]="paidPercentage()"></div>
              </div>
            </div>

            <dl class="grid grid-cols-2 divide-x divide-y divide-surface-200 text-sm dark:divide-surface-700 sm:grid-cols-3">
              <div class="p-4">
                <dt class="text-muted-color">Monto prestado</dt>
                <dd class="mt-1 font-semibold text-color">{{ detail.loan.principal | currency: 'PEN' : 'symbol' : '1.2-2' : 'es-PE' }}</dd>
              </div>
              <div class="p-4">
                <dt class="text-muted-color">Interés ({{ detail.loan.interestRate }}%)</dt>
                <dd class="mt-1 font-semibold text-color">{{ interestAmount() | currency: 'PEN' : 'symbol' : '1.2-2' : 'es-PE' }}</dd>
              </div>
              <div class="p-4">
                <dt class="text-muted-color">Total a pagar</dt>
                <dd class="mt-1 font-semibold text-color">{{ detail.loan.totalAmount | currency: 'PEN' : 'symbol' : '1.2-2' : 'es-PE' }}</dd>
              </div>
              <div class="p-4">
                <dt class="text-muted-color">Valor de cuota</dt>
                <dd class="mt-1 font-semibold text-primary">{{ detail.loan.installmentAmount | currency: 'PEN' : 'symbol' : '1.2-2' : 'es-PE' }}</dd>
              </div>
              <div class="p-4">
                <dt class="text-muted-color">Fecha de inicio</dt>
                <dd class="mt-1 font-semibold text-color">{{ formatDate(detail.loan.startedOn) }}</dd>
              </div>
              <div class="p-4">
                <dt class="text-muted-color">Fecha de fin</dt>
                <dd class="mt-1 font-semibold text-color">{{ formatDate(detail.loan.endDate) }}</dd>
              </div>
            </dl>
          </section>
        </div>

        @if (!canEdit() && detail.loan.status === 'active') {
          <p-message severity="info" styleClass="w-full">
            Este préstamo ya tiene historial de pagos y sus condiciones financieras no se pueden editar.
          </p-message>
        }

        @if (editing()) {
          <section class="rounded-xl border-2 border-primary/30 bg-surface-0 p-4 shadow-sm dark:bg-surface-900 sm:p-6" aria-labelledby="edit-loan-title">
            <div class="mb-5">
              <h2 id="edit-loan-title" class="text-xl font-semibold text-color">Editar préstamo</h2>
              <p class="mt-1 text-sm text-muted-color">
                El cliente no cambia. Las cuotas se recalculan con las nuevas condiciones.
              </p>
            </div>

            <form class="flex flex-col gap-5" (submit)="saveChanges(); $event.preventDefault()">
              <div class="grid gap-4 sm:grid-cols-2">
                <div>
                  <label for="edit-principal" class="mb-2 block text-sm font-medium text-color">Capital</label>
                  <p-inputnumber
                    inputId="edit-principal"
                    [formField]="editForm.principal"
                    mode="currency"
                    currency="PEN"
                    locale="es-PE"
                    styleClass="w-full"
                  />
                  @if (editForm.principal().touched() && editForm.principal().invalid()) {
                    <small class="mt-1 block text-red-600">{{ editForm.principal().errors()[0]?.message }}</small>
                  }
                </div>
                <div>
                  <label for="edit-interest" class="mb-2 block text-sm font-medium text-color">Tasa de interés</label>
                  <p-inputnumber
                    inputId="edit-interest"
                    [formField]="editForm.interestRate"
                    suffix="%"
                    [maxFractionDigits]="4"
                    styleClass="w-full"
                  />
                  @if (editForm.interestRate().touched() && editForm.interestRate().invalid()) {
                    <small class="mt-1 block text-red-600">{{ editForm.interestRate().errors()[0]?.message }}</small>
                  }
                </div>
                <div>
                  <label for="edit-frequency" class="mb-2 block text-sm font-medium text-color">Frecuencia</label>
                  <p-select
                    inputId="edit-frequency"
                    [formField]="editForm.frequency"
                    [options]="frequencyOptions"
                    optionLabel="label"
                    optionValue="value"
                    appendTo="body"
                    styleClass="w-full"
                  />
                </div>
                <div>
                  <label for="edit-count" class="mb-2 block text-sm font-medium text-color">Cantidad de cuotas</label>
                  <p-inputnumber
                    inputId="edit-count"
                    [formField]="editForm.installmentCount"
                    [useGrouping]="false"
                    styleClass="w-full"
                  />
                  @if (editForm.installmentCount().touched() && editForm.installmentCount().invalid()) {
                    <small class="mt-1 block text-red-600">{{ editForm.installmentCount().errors()[0]?.message }}</small>
                  }
                </div>
              </div>

              <div>
                <label for="edit-start" class="mb-2 block text-sm font-medium text-color">Fecha de inicio</label>
                <input
                  id="edit-start"
                  type="date"
                  class="w-full rounded-md border border-surface px-3 py-2.5 text-color outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 dark:bg-surface-950"
                  [formField]="editForm.startedOn"
                />
                @if (editForm.startedOn().touched() && editForm.startedOn().invalid()) {
                  <small class="mt-1 block text-red-600">{{ editForm.startedOn().errors()[0]?.message }}</small>
                }
              </div>

              <div>
                <label for="edit-reason" class="mb-2 block text-sm font-medium text-color">Motivo de la edición</label>
                <textarea
                  id="edit-reason"
                  rows="3"
                  class="w-full resize-y rounded-md border border-surface px-3 py-2.5 text-color outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 dark:bg-surface-950"
                  placeholder="Describe por qué se corrigen las condiciones del préstamo"
                  [formField]="editForm.reason"
                ></textarea>
                @if (editForm.reason().touched() && editForm.reason().invalid()) {
                  <small class="mt-1 block text-red-600">{{ editForm.reason().errors()[0]?.message }}</small>
                }
              </div>

              <section class="grid grid-cols-2 gap-3 rounded-xl bg-surface-50 p-4 text-sm dark:bg-surface-800 sm:grid-cols-3" aria-label="Nuevo resumen del préstamo">
                <div>
                  <p class="text-muted-color">Nuevo total</p>
                  <p class="mt-1 font-semibold text-color">{{ editSummary().totalAmount | currency: 'PEN' : 'symbol' : '1.2-2' : 'es-PE' }}</p>
                </div>
                <div>
                  <p class="text-muted-color">Nueva cuota</p>
                  <p class="mt-1 font-semibold text-primary">{{ editSummary().baseInstallmentAmount | currency: 'PEN' : 'symbol' : '1.2-2' : 'es-PE' }}</p>
                </div>
                <div class="col-span-2 sm:col-span-1">
                  <p class="text-muted-color">Primer pago</p>
                  <p class="mt-1 font-semibold text-color">{{ formatDate(editFirstDueDate()) }}</p>
                </div>
              </section>

              <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <p-button
                  type="button"
                  label="Cancelar"
                  severity="secondary"
                  variant="text"
                  styleClass="w-full sm:w-auto"
                  (onClick)="cancelEditing()"
                />
                <p-button
                  type="submit"
                  label="Guardar cambios"
                  icon="pi pi-check"
                  styleClass="w-full sm:w-auto"
                  [loading]="store.saving()"
                  [disabled]="editForm().invalid()"
                />
              </div>
            </form>
          </section>
        }

        <section class="rounded-xl border border-surface bg-surface-0 p-4 shadow-sm dark:bg-surface-900 sm:p-5" aria-labelledby="schedule-title">
          <div class="mb-4 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 id="schedule-title" class="text-xl font-semibold text-color">Cronograma de pagos</h2>
              <p class="mt-1 text-sm text-muted-color">{{ detail.installments.length }} cuotas programadas</p>
            </div>
            <span class="text-sm font-medium text-muted-color">Fin: {{ formatDate(detail.loan.endDate) }}</span>
          </div>

          <div class="space-y-3 md:hidden">
            @for (installment of detail.installments; track installment.id) {
              <article class="rounded-lg border border-surface p-3">
                <div class="flex items-center justify-between gap-3">
                  <div>
                    <p class="font-semibold text-color">Cuota {{ installment.installmentNumber }}</p>
                    <p class="text-sm text-muted-color">Vence {{ formatDate(installment.dueDate) }}</p>
                  </div>
                  <p-tag
                    [severity]="installmentSeverity(installment.status)"
                    [value]="installmentStatusLabel(installment.status)"
                  />
                </div>
                <dl class="mt-3 grid grid-cols-3 gap-2 border-t border-surface-200 pt-3 text-sm dark:border-surface-700">
                  <div>
                    <dt class="text-muted-color">Esperado</dt>
                    <dd class="mt-1 font-semibold text-color">{{ installment.scheduledAmount | currency: 'PEN' : 'symbol' : '1.2-2' : 'es-PE' }}</dd>
                  </div>
                  <div>
                    <dt class="text-muted-color">Pagado</dt>
                    <dd class="mt-1 font-semibold text-green-600">{{ installment.paidAmount | currency: 'PEN' : 'symbol' : '1.2-2' : 'es-PE' }}</dd>
                  </div>
                  <div>
                    <dt class="text-muted-color">Saldo</dt>
                    <dd class="mt-1 font-semibold text-color">{{ installment.outstandingAmount | currency: 'PEN' : 'symbol' : '1.2-2' : 'es-PE' }}</dd>
                  </div>
                </dl>
                @if (installment.overdueDays > 0) {
                  <p class="mt-2 text-sm font-medium text-red-600">{{ installment.overdueDays }} días de atraso</p>
                }
              </article>
            }
          </div>

          <div class="hidden md:block">
            <p-table [value]="detail.installments" responsiveLayout="scroll" styleClass="p-datatable-sm">
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
                  <td class="text-right text-green-600">{{ installment.paidAmount | currency: 'PEN' : 'symbol' : '1.2-2' : 'es-PE' }}</td>
                  <td class="text-right font-semibold">{{ installment.outstandingAmount | currency: 'PEN' : 'symbol' : '1.2-2' : 'es-PE' }}</td>
                  <td>
                    <p-tag
                      [severity]="installmentSeverity(installment.status)"
                      [value]="installmentStatusLabel(installment.status)"
                    />
                    @if (installment.overdueDays > 0) {
                      <small class="ml-2 text-red-600">{{ installment.overdueDays }} días</small>
                    }
                  </td>
                </tr>
              </ng-template>
            </p-table>
          </div>
        </section>

        <section class="rounded-xl border border-surface bg-surface-0 p-4 shadow-sm dark:bg-surface-900 sm:p-5" aria-labelledby="payments-title">
          <div class="mb-4">
            <h2 id="payments-title" class="text-xl font-semibold text-color">Historial de pagos recibidos</h2>
            <p class="mt-1 text-sm text-muted-color">Incluye pagos vigentes y anulados para conservar la trazabilidad.</p>
          </div>

          @if (detail.payments.length === 0) {
            <div class="rounded-lg border border-dashed border-surface px-5 py-8 text-center">
              <i class="pi pi-receipt mb-3 text-3xl text-muted-color" aria-hidden="true"></i>
              <p class="font-medium text-color">Aún no se han registrado pagos</p>
              <p class="mt-1 text-sm text-muted-color">Los pagos recibidos aparecerán aquí en orden reciente.</p>
            </div>
          } @else {
            <div class="space-y-3 md:hidden">
              @for (payment of detail.payments; track payment.id) {
                <article class="rounded-lg border border-surface p-3" [class.opacity-60]="payment.status === 'voided'">
                  <div class="flex items-start justify-between gap-3">
                    <div>
                      <p class="text-xl font-bold" [class.line-through]="payment.status === 'voided'" [class.text-green-600]="payment.status === 'posted'">
                        {{ payment.amount | currency: 'PEN' : 'symbol' : '1.2-2' : 'es-PE' }}
                      </p>
                      <p class="mt-0.5 text-sm text-muted-color">{{ formatDateTime(payment.paidAt) }}</p>
                    </div>
                    <p-tag [severity]="paymentSeverity(payment.status)" [value]="paymentStatusLabel(payment.status)" />
                  </div>
                  <dl class="mt-3 grid gap-2 border-t border-surface-200 pt-3 text-sm dark:border-surface-700">
                    <div class="flex justify-between gap-3">
                      <dt class="text-muted-color">Cobrador</dt>
                      <dd class="text-right font-medium text-color">{{ payment.collectorName }}</dd>
                    </div>
                    <div class="flex justify-between gap-3">
                      <dt class="text-muted-color">Medio</dt>
                      <dd class="text-right font-medium text-color">{{ paymentMethodLabel(payment.paymentMethod) }}</dd>
                    </div>
                    @if (payment.notes) {
                      <div>
                        <dt class="text-muted-color">Observación</dt>
                        <dd class="mt-1 text-color">{{ payment.notes }}</dd>
                      </div>
                    }
                    @if (payment.voidReason) {
                      <div>
                        <dt class="text-muted-color">Motivo de anulación</dt>
                        <dd class="mt-1 text-red-600">{{ payment.voidReason }}</dd>
                      </div>
                    }
                  </dl>
                </article>
              }
            </div>

            <div class="hidden md:block">
              <p-table [value]="detail.payments" responsiveLayout="scroll" styleClass="p-datatable-sm">
                <ng-template #header>
                  <tr>
                    <th>Fecha</th>
                    <th class="text-right">Monto</th>
                    <th>Medio</th>
                    <th>Cobrador</th>
                    <th>Observación</th>
                    <th>Estado</th>
                  </tr>
                </ng-template>
                <ng-template #body let-payment>
                  <tr [class.opacity-60]="payment.status === 'voided'">
                    <td>{{ formatDateTime(payment.paidAt) }}</td>
                    <td class="text-right font-semibold" [class.line-through]="payment.status === 'voided'" [class.text-green-600]="payment.status === 'posted'">
                      {{ payment.amount | currency: 'PEN' : 'symbol' : '1.2-2' : 'es-PE' }}
                    </td>
                    <td>{{ paymentMethodLabel(payment.paymentMethod) }}</td>
                    <td>{{ payment.collectorName }}</td>
                    <td>
                      {{ payment.notes || '—' }}
                      @if (payment.voidReason) {
                        <small class="mt-1 block text-red-600">Anulación: {{ payment.voidReason }}</small>
                      }
                    </td>
                    <td><p-tag [severity]="paymentSeverity(payment.status)" [value]="paymentStatusLabel(payment.status)" /></td>
                  </tr>
                </ng-template>
              </p-table>
            </div>
          }
        </section>
      } @else {
        <section class="rounded-xl border border-dashed border-surface bg-surface-0 px-6 py-12 text-center dark:bg-surface-900">
          <h1 id="loan-detail-title" class="text-xl font-semibold text-color">Préstamo no encontrado</h1>
          <p class="mt-2 text-sm text-muted-color">Verifica el enlace o vuelve al listado de préstamos.</p>
        </section>
      }
    </main>
  `,
})
export default class LoanDetailPage {
  protected readonly store = inject(LoansStore);
  private readonly route = inject(ActivatedRoute);
  private readonly messageService = inject(MessageService);

  private readonly loanId = this.route.snapshot.paramMap.get('loanId') ?? '';
  protected readonly editing = signal(false);
  protected readonly frequencyOptions: Array<{ label: string; value: LoanFrequency }> = [
    { label: 'Diario', value: 'daily' },
    { label: 'Semanal', value: 'weekly' },
    { label: 'Mensual', value: 'monthly' },
  ];

  protected readonly detail = this.store.selectedDetail;
  protected readonly editModel = signal<LoanEditModel>(emptyEditModel());
  protected readonly editForm = form(this.editModel, (path) => {
    min(path.principal, 0.01, { message: 'El capital debe ser mayor que cero.' });
    min(path.interestRate, 0, { message: 'La tasa no puede ser negativa.' });
    min(path.installmentCount, 1, { message: 'Debe existir al menos una cuota.' });
    max(path.installmentCount, 32767, { message: 'La cantidad de cuotas es demasiado alta.' });
    required(path.startedOn, { message: 'Selecciona la fecha de inicio.' });
    required(path.reason, { message: 'Ingresa el motivo de la edición.' });
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

  protected readonly totalPaid = computed(() => {
    const loan = this.detail()?.loan;
    return loan ? loan.totalAmount - loan.balance : 0;
  });
  protected readonly paidPercentage = computed(() => {
    const loan = this.detail()?.loan;
    if (!loan || loan.totalAmount <= 0) return 0;
    return Math.min(100, Math.max(0, (this.totalPaid() / loan.totalAmount) * 100));
  });
  protected readonly interestAmount = computed(() => {
    const loan = this.detail()?.loan;
    return loan ? loan.totalAmount - loan.principal : 0;
  });
  protected readonly canEdit = computed(() => {
    const detail = this.detail();
    return detail?.loan.status === 'active' && detail.payments.length === 0;
  });
  protected readonly clientInitials = computed(() =>
    (this.detail()?.client.fullName ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase(),
  );
  protected readonly editSummary = computed(() => {
    const model = this.editModel();
    return calculateLoanSummary(model.principal, model.interestRate, model.installmentCount);
  });
  protected readonly editFirstDueDate = computed(() => {
    const model = this.editModel();
    return firstDueOn(model.startedOn, model.frequency);
  });

  constructor() {
    void this.store.loadDetail(this.loanId);
  }

  protected startEditing(): void {
    const loan = this.detail()?.loan;
    if (!loan || !this.canEdit()) return;

    this.store.clearError();
    this.editModel.set({
      principal: loan.principal,
      interestRate: loan.interestRate,
      frequency: loan.frequency,
      installmentCount: loan.installmentCount,
      startedOn: loan.startedOn,
      reason: '',
    });
    this.editForm().reset();
    this.editing.set(true);
  }

  protected cancelEditing(): void {
    this.editing.set(false);
    this.store.clearError();
  }

  protected saveChanges(): void {
    void submit(this.editForm, async () => {
      const model = this.editModel();
      const updated = await this.store.update({
        loanId: this.loanId,
        principal: model.principal,
        interestRate: model.interestRate,
        frequency: model.frequency,
        installmentCount: model.installmentCount,
        startedOn: model.startedOn,
        reason: model.reason.trim(),
      });

      if (updated) {
        this.editing.set(false);
        this.messageService.add({
          severity: 'success',
          summary: 'Préstamo actualizado',
          detail: 'Las condiciones y el cronograma fueron recalculados correctamente.',
        });
      }
    });
  }

  protected frequencyLabel(frequency: LoanFrequency): string {
    return this.frequencyOptions.find((option) => option.value === frequency)?.label ?? frequency;
  }

  protected loanStatusLabel(status: LoanStatus): string {
    return { active: 'Activo', paid: 'Pagado', renewed: 'Renovado', voided: 'Anulado' }[status];
  }

  protected loanStatusSeverity(status: LoanStatus): TagSeverity {
    return status === 'active' ? 'success' : status === 'voided' ? 'danger' : 'secondary';
  }

  protected installmentStatusLabel(status: LoanInstallmentStatus): string {
    return { pending: 'Pendiente', partial: 'Pago parcial', overdue: 'Vencido', paid: 'Pagado' }[status];
  }

  protected installmentSeverity(status: LoanInstallmentStatus): TagSeverity {
    return { pending: 'secondary', partial: 'warn', overdue: 'danger', paid: 'success' }[status] as TagSeverity;
  }

  protected paymentStatusLabel(status: LoanPaymentRecord['status']): string {
    return status === 'posted' ? 'Registrado' : 'Anulado';
  }

  protected paymentSeverity(status: LoanPaymentRecord['status']): TagSeverity {
    return status === 'posted' ? 'success' : 'danger';
  }

  protected paymentMethodLabel(method: string): string {
    const labels: Record<string, string> = {
      cash: 'Efectivo',
      yape: 'Yape',
      plin: 'Plin',
      transfer: 'Transferencia',
    };
    return labels[method.toLowerCase()] ?? method;
  }

  protected formatDate(value: string): string {
    if (!value) return '—';
    return new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium' }).format(new Date(`${value}T00:00:00`));
  }

  protected formatDateTime(value: string): string {
    return new Intl.DateTimeFormat('es-PE', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'America/Lima',
    }).format(new Date(value));
  }
}
