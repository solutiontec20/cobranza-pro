import { Component, computed, inject, OnInit, signal } from '@angular/core';
import {
  form,
  FormField,
  max,
  maxLength,
  min,
  minLength,
  required,
  submit,
  validate,
} from '@angular/forms/signals';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';

import {
  CorrectionRequest,
  CorrectionRequestStatus,
  CorrectionRequestType,
} from '../../../core/models/correction-request.model';
import { LoanFrequency } from '../../../core/models/loan.model';
import {
  LOAN_VOID_REASON_OPTIONS,
  PAYMENT_VOID_REASON_OPTIONS,
  resolveVoidReason,
  VoidReasonCode,
} from '../../../core/models/void-reason.model';
import { CorrectionRequestsStore } from '../../correction-requests/correction-requests.store';
import { EsDate } from '../../../shared/pipes/es-date';
import { PenCurrency } from '../../../shared/pipes/pen-currency';

interface ResolutionModel {
  reasonCode: VoidReasonCode | '';
  customReason: string;
}

interface EditResolutionModel {
  principal: number;
  interestRate: number;
  frequency: LoanFrequency;
  installmentCount: number;
  startedOn: string;
  reason: string;
}

type ResolutionAction = 'reject' | 'void_loan' | 'void_payment';

interface ResolutionTarget {
  action: ResolutionAction;
  request: CorrectionRequest;
}

@Component({
  selector: 'app-correction-requests',
  imports: [
    RouterLink,
    FormsModule,
    FormField,
    ButtonModule,
    DialogModule,
    InputNumberModule,
    MessageModule,
    SelectModule,
    TagModule,
    EsDate,
    PenCurrency,
  ],
  template: `
    <section class="mx-auto flex w-full max-w-6xl flex-col gap-5" aria-labelledby="page-title">
      <header class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p class="m-0 text-sm font-semibold text-primary">Control financiero</p>
          <h1
            id="page-title"
            class="mt-1 mb-0 text-2xl font-bold text-surface-950 dark:text-surface-0"
          >
            Solicitudes de corrección
          </h1>
          <p class="mt-2 mb-0 max-w-2xl text-sm text-surface-500 dark:text-surface-400">
            Revisá el préstamo o pago exacto antes de aplicar una corrección. Ninguna acción elimina
            el historial financiero.
          </p>
        </div>

        <div class="flex items-center gap-2">
          <label for="request-status" class="sr-only">Filtrar por estado</label>
          <p-select
            inputId="request-status"
            [options]="statusOptions"
            optionLabel="label"
            optionValue="value"
            [ngModel]="statusFilter()"
            (ngModelChange)="changeStatus($event)"
            styleClass="min-w-40"
          />
          <button
            pButton
            type="button"
            severity="secondary"
            variant="outlined"
            aria-label="Actualizar solicitudes"
            [disabled]="store.loading()"
            (click)="reload()"
          >
            <i class="pi pi-refresh" [class.pi-spin]="store.loading()" aria-hidden="true"></i>
          </button>
        </div>
      </header>

      <div class="grid gap-3 sm:grid-cols-2">
        <article
          class="rounded-xl border border-surface-200 bg-surface-0 p-4 dark:border-surface-700 dark:bg-surface-900"
        >
          <p class="m-0 text-xs font-semibold tracking-wide text-surface-500 uppercase">
            Pendientes
          </p>
          <p class="mt-2 mb-0 text-3xl font-bold text-primary">{{ store.pendingCount() }}</p>
        </article>
        <article
          class="rounded-xl border border-surface-200 bg-surface-0 p-4 dark:border-surface-700 dark:bg-surface-900"
        >
          <p class="m-0 text-xs font-semibold tracking-wide text-surface-500 uppercase">
            En pantalla
          </p>
          <p class="mt-2 mb-0 text-3xl font-bold text-surface-950 dark:text-surface-0">
            {{ store.requests().length }}
          </p>
        </article>
      </div>

      @if (store.error()) {
        <p-message severity="error" styleClass="w-full" role="alert">{{ store.error() }}</p-message>
      }

      @if (store.loading()) {
        <div
          class="rounded-xl border border-surface-200 bg-surface-0 p-8 text-center dark:border-surface-700 dark:bg-surface-900"
        >
          <i class="pi pi-spin pi-spinner text-2xl text-primary" aria-hidden="true"></i>
          <p class="mt-3 mb-0 text-sm text-surface-500">Cargando solicitudes…</p>
        </div>
      } @else if (store.requests().length === 0) {
        <div
          class="rounded-xl border border-dashed border-surface-300 bg-surface-0 p-10 text-center dark:border-surface-600 dark:bg-surface-900"
        >
          <i class="pi pi-check-circle text-4xl text-green-600" aria-hidden="true"></i>
          <h2 class="mt-3 mb-1 text-lg font-semibold">No hay solicitudes para este filtro</h2>
          <p class="m-0 text-sm text-surface-500">
            Las nuevas solicitudes aparecerán también en la campana.
          </p>
        </div>
      } @else {
        <div class="grid gap-4 lg:grid-cols-2">
          @for (request of store.requests(); track request.id) {
            <article
              class="flex flex-col rounded-xl border border-surface-200 bg-surface-0 shadow-sm dark:border-surface-700 dark:bg-surface-900"
            >
              <div
                class="flex items-start justify-between gap-3 border-b border-surface-200 p-4 dark:border-surface-700"
              >
                <div>
                  <p class="m-0 text-xs font-semibold text-primary">
                    {{ requestTypeLabel(request.requestType) }}
                  </p>
                  <h2 class="mt-1 mb-0 text-lg font-bold text-surface-950 dark:text-surface-0">
                    {{ request.customerName }}
                  </h2>
                  <p class="mt-1 mb-0 text-xs text-surface-500">
                    DNI {{ request.customerDocument }} ·
                    {{ request.createdAt | esDate: 'short-datetime' }}
                  </p>
                </div>
                <p-tag
                  [severity]="statusSeverity(request.status)"
                  [value]="statusLabel(request.status)"
                />
              </div>

              <div class="flex flex-1 flex-col gap-4 p-4">
                <dl class="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt class="text-xs text-surface-500">Cobrador</dt>
                    <dd class="m-0 font-semibold">{{ request.collectorName }}</dd>
                  </div>
                  <div>
                    <dt class="text-xs text-surface-500">Préstamo</dt>
                    <dd class="m-0 font-semibold">{{ request.loanTotal | penCurrency }}</dd>
                  </div>
                  <div>
                    <dt class="text-xs text-surface-500">Capital</dt>
                    <dd class="m-0 font-semibold">{{ request.loanPrincipal | penCurrency }}</dd>
                  </div>
                  <div>
                    <dt class="text-xs text-surface-500">Cuotas</dt>
                    <dd class="m-0 font-semibold">{{ request.loanInstallmentCount }}</dd>
                  </div>
                  @if (request.paymentAmount !== null) {
                    <div>
                      <dt class="text-xs text-surface-500">Pago seleccionado</dt>
                      <dd class="m-0 font-semibold text-primary">
                        {{ request.paymentAmount | penCurrency }}
                      </dd>
                    </div>
                    <div>
                      <dt class="text-xs text-surface-500">Fecha del pago</dt>
                      <dd class="m-0 font-semibold">{{ request.paymentDate | esDate: 'short' }}</dd>
                    </div>
                  }
                </dl>

                <div class="rounded-lg bg-surface-50 p-3 dark:bg-surface-800">
                  <p class="m-0 text-xs font-semibold text-surface-500 uppercase">
                    Motivo del cobrador
                  </p>
                  <p class="mt-1 mb-0 whitespace-pre-wrap text-sm">{{ request.reason }}</p>
                </div>

                @if (request.resolutionNote) {
                  <div class="rounded-lg border border-surface-200 p-3 dark:border-surface-700">
                    <p class="m-0 text-xs font-semibold text-surface-500 uppercase">Resolución</p>
                    <p class="mt-1 mb-0 whitespace-pre-wrap text-sm">
                      {{ request.resolutionNote }}
                    </p>
                  </div>
                }
              </div>

              <footer
                class="flex flex-wrap gap-2 border-t border-surface-200 p-4 dark:border-surface-700"
              >
                <a
                  pButton
                  [routerLink]="['/admin/prestamos', request.loanId]"
                  severity="secondary"
                  variant="outlined"
                  size="small"
                >
                  <i class="pi pi-eye"></i> Ver préstamo
                </a>
                @if (request.status === 'pending') {
                  <button
                    pButton
                    type="button"
                    severity="secondary"
                    variant="text"
                    size="small"
                    (click)="openResolution(request, 'reject')"
                  >
                    Rechazar
                  </button>
                  @if (request.requestType === 'edit_loan') {
                    <button pButton type="button" size="small" (click)="openEdit(request)">
                      <i class="pi pi-pencil"></i> Revisar edición
                    </button>
                  } @else if (request.requestType === 'void_loan') {
                    <button
                      pButton
                      type="button"
                      severity="danger"
                      size="small"
                      (click)="openResolution(request, 'void_loan')"
                    >
                      <i class="pi pi-ban"></i> Anular préstamo
                    </button>
                  } @else {
                    <button
                      pButton
                      type="button"
                      severity="danger"
                      size="small"
                      (click)="openResolution(request, 'void_payment')"
                    >
                      <i class="pi pi-ban"></i> Anular pago
                    </button>
                  }
                }
              </footer>
            </article>
          }
        </div>
      }
    </section>

    <p-dialog
      [header]="resolutionDialogTitle()"
      [visible]="!!resolutionTarget()"
      (visibleChange)="!$event && closeResolution()"
      [modal]="true"
      [draggable]="false"
      [breakpoints]="{ '640px': '100vw' }"
      styleClass="w-[calc(100vw-1.5rem)] max-w-md"
    >
      @if (resolutionTarget(); as target) {
        <form class="flex flex-col gap-4" (submit)="submitResolution(); $event.preventDefault()">
          <p-message [severity]="target.action === 'reject' ? 'info' : 'warn'" styleClass="w-full">
            @if (target.action === 'reject') {
              La solicitud quedará rechazada y el registro financiero no cambiará.
            } @else {
              Esta acción es auditada y no elimina ningún registro del historial.
            }
          </p-message>
          @if (target.action !== 'reject') {
            <div>
              <label for="resolution-reason-code" class="mb-2 block text-sm font-semibold">
                Motivo de la anulación
              </label>
              <p-select
                inputId="resolution-reason-code"
                [formField]="resolutionForm.reasonCode"
                [options]="resolutionReasonOptions()"
                optionLabel="label"
                optionValue="value"
                placeholder="Seleccioná un motivo"
                appendTo="body"
                styleClass="w-full"
              />
              @if (resolutionForm.reasonCode().touched() && resolutionForm.reasonCode().invalid()) {
                <small class="mt-1 block text-red-600" role="alert">
                  {{ resolutionForm.reasonCode().errors()[0]?.message }}
                </small>
              }
            </div>
          }

          @if (target.action === 'reject' || resolutionModel().reasonCode === 'other') {
            <div>
              <label for="resolution-custom-reason" class="mb-2 block text-sm font-semibold">
                {{ target.action === 'reject' ? 'Motivo del rechazo' : 'Explicá el motivo' }}
              </label>
              <textarea
                id="resolution-custom-reason"
                rows="4"
                [formField]="resolutionForm.customReason"
                class="w-full resize-none rounded-md border border-surface-300 bg-surface-0 px-3 py-2 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-surface-600 dark:bg-surface-950"
              ></textarea>
              @if (
                resolutionForm.customReason().touched() && resolutionForm.customReason().invalid()
              ) {
                <small class="mt-1 block text-red-600" role="alert">
                  {{ resolutionForm.customReason().errors()[0]?.message }}
                </small>
              }
            </div>
          }
          <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              pButton
              type="button"
              severity="secondary"
              variant="outlined"
              (click)="closeResolution()"
            >
              Cancelar
            </button>
            <button
              pButton
              type="submit"
              [severity]="target.action === 'reject' ? 'primary' : 'danger'"
              [disabled]="store.saving() || resolutionForm().invalid()"
            >
              @if (store.saving()) {
                <i class="pi pi-spin pi-spinner"></i>
              }
              Confirmar
            </button>
          </div>
        </form>
      }
    </p-dialog>

    <p-dialog
      header="Aplicar edición solicitada"
      [visible]="!!editTarget()"
      (visibleChange)="!$event && closeEdit()"
      [modal]="true"
      [draggable]="false"
      [breakpoints]="{ '720px': '100vw' }"
      styleClass="w-[calc(100vw-1.5rem)] max-w-xl"
    >
      @if (editTarget()) {
        <form class="flex flex-col gap-4" (submit)="submitEdit(); $event.preventDefault()">
          <p-message severity="warn" styleClass="w-full">
            La edición solo será aceptada si el préstamo continúa activo y no tiene historial de
            pagos.
          </p-message>
          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <label for="edit-principal" class="mb-2 block text-sm font-semibold">Capital</label>
              <p-inputnumber
                inputId="edit-principal"
                [formField]="editForm.principal"
                mode="currency"
                currency="PEN"
                locale="es-PE"
                styleClass="w-full"
              />
            </div>
            <div>
              <label for="edit-rate" class="mb-2 block text-sm font-semibold"
                >Tasa de interés</label
              >
              <p-inputnumber
                inputId="edit-rate"
                [formField]="editForm.interestRate"
                suffix="%"
                [maxFractionDigits]="4"
                styleClass="w-full"
              />
            </div>
            <div>
              <label for="edit-frequency" class="mb-2 block text-sm font-semibold"
                >Frecuencia</label
              >
              <p-select
                inputId="edit-frequency"
                [formField]="editForm.frequency"
                [options]="frequencyOptions"
                optionLabel="label"
                optionValue="value"
                styleClass="w-full"
                appendTo="body"
              />
            </div>
            <div>
              <label for="edit-count" class="mb-2 block text-sm font-semibold"
                >Cantidad de cuotas</label
              >
              <p-inputnumber
                inputId="edit-count"
                [formField]="editForm.installmentCount"
                [useGrouping]="false"
                styleClass="w-full"
              />
            </div>
          </div>
          <div>
            <label for="edit-start" class="mb-2 block text-sm font-semibold"
              >Fecha del préstamo</label
            >
            <input
              id="edit-start"
              type="date"
              [formField]="editForm.startedOn"
              class="w-full rounded-md border border-surface-300 bg-surface-0 px-3 py-2.5 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-surface-600 dark:bg-surface-950"
            />
          </div>
          <div>
            <label for="edit-reason" class="mb-2 block text-sm font-semibold"
              >Motivo auditado</label
            >
            <textarea
              id="edit-reason"
              rows="3"
              [formField]="editForm.reason"
              class="w-full resize-none rounded-md border border-surface-300 bg-surface-0 px-3 py-2 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-surface-600 dark:bg-surface-950"
            ></textarea>
            @if (editForm.reason().touched() && editForm.reason().invalid()) {
              <small class="mt-1 block text-red-600" role="alert">{{
                editForm.reason().errors()[0]?.message
              }}</small>
            }
          </div>
          <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              pButton
              type="button"
              severity="secondary"
              variant="outlined"
              (click)="closeEdit()"
            >
              Cancelar
            </button>
            <button pButton type="submit" [disabled]="store.saving() || editForm().invalid()">
              @if (store.saving()) {
                <i class="pi pi-spin pi-spinner"></i>
              }
              Aplicar edición
            </button>
          </div>
        </form>
      }
    </p-dialog>
  `,
})
export default class CorrectionRequests implements OnInit {
  protected readonly store = inject(CorrectionRequestsStore);
  private readonly messageService = inject(MessageService);

  protected readonly statusFilter = signal<CorrectionRequestStatus | null>('pending');
  protected readonly statusOptions: Array<{
    label: string;
    value: CorrectionRequestStatus | null;
  }> = [
    { label: 'Pendientes', value: 'pending' },
    { label: 'Todas', value: null },
  ];
  protected readonly frequencyOptions: Array<{ label: string; value: LoanFrequency }> = [
    { label: 'Diaria', value: 'daily' },
    { label: 'Semanal', value: 'weekly' },
    { label: 'Mensual', value: 'monthly' },
  ];

  protected readonly resolutionTarget = signal<ResolutionTarget | null>(null);
  protected readonly resolutionModel = signal<ResolutionModel>({
    reasonCode: '',
    customReason: '',
  });
  protected readonly resolutionForm = form(this.resolutionModel, (path) => {
    required(path.reasonCode, { message: 'Seleccioná un motivo.' });
    maxLength(path.customReason, 1000, { message: 'El motivo no puede superar 1000 caracteres.' });
    validate(path.customReason, ({ valueOf }) =>
      valueOf(path.reasonCode) === 'other' && valueOf(path.customReason).trim().length < 5
        ? { kind: 'required', message: 'Explicá el motivo en al menos 5 caracteres.' }
        : undefined,
    );
  });
  protected readonly resolutionReasonOptions = computed(() =>
    this.resolutionTarget()?.action === 'void_payment'
      ? PAYMENT_VOID_REASON_OPTIONS
      : LOAN_VOID_REASON_OPTIONS,
  );

  protected readonly editTarget = signal<CorrectionRequest | null>(null);
  protected readonly editModel = signal<EditResolutionModel>({
    principal: 0,
    interestRate: 0,
    frequency: 'daily',
    installmentCount: 1,
    startedOn: '',
    reason: '',
  });
  protected readonly editForm = form(this.editModel, (path) => {
    required(path.principal, { message: 'Ingresá el capital.' });
    min(path.principal, 0.01, { message: 'El capital debe ser mayor que cero.' });
    min(path.interestRate, 0, { message: 'La tasa no puede ser negativa.' });
    required(path.installmentCount, { message: 'Ingresá la cantidad de cuotas.' });
    min(path.installmentCount, 1, { message: 'Debe existir al menos una cuota.' });
    max(path.installmentCount, 32767, { message: 'La cantidad de cuotas es demasiado alta.' });
    required(path.startedOn, { message: 'Seleccioná la fecha del préstamo.' });
    required(path.reason, { message: 'Ingresá el motivo auditado.' });
    minLength(path.reason, 5, { message: 'El motivo debe tener al menos 5 caracteres.' });
    maxLength(path.reason, 1000, { message: 'El motivo no puede superar 1000 caracteres.' });
  });

  protected readonly resolutionDialogTitle = computed(() => {
    const action = this.resolutionTarget()?.action;
    if (action === 'reject') return 'Rechazar solicitud';
    if (action === 'void_payment') return 'Anular pago';
    return 'Anular préstamo';
  });

  ngOnInit(): void {
    this.reload();
  }

  protected reload(): void {
    void Promise.all([this.store.load(this.statusFilter()), this.store.refreshPendingCount()]);
  }

  protected changeStatus(status: CorrectionRequestStatus | null): void {
    this.statusFilter.set(status);
    void this.store.load(status);
  }

  protected openResolution(request: CorrectionRequest, action: ResolutionAction): void {
    this.store.clearError();
    this.resolutionTarget.set({ request, action });
    this.resolutionModel.set({
      reasonCode: action === 'reject' ? 'other' : '',
      customReason: '',
    });
    this.resolutionForm().reset();
  }

  protected closeResolution(): void {
    if (!this.store.saving()) this.resolutionTarget.set(null);
  }

  protected submitResolution(): void {
    const target = this.resolutionTarget();
    if (!target) return;

    void submit(this.resolutionForm, async () => {
      const model = this.resolutionModel();
      const resolutionNote = resolveVoidReason(model.reasonCode, model.customReason);
      if (!resolutionNote) return;
      const input = { requestId: target.request.id, resolutionNote };
      const succeeded =
        target.action === 'reject'
          ? await this.store.reject(input)
          : target.action === 'void_loan'
            ? await this.store.resolveVoidLoan(input)
            : await this.store.resolveVoidPayment(input);

      if (succeeded) {
        this.resolutionTarget.set(null);
        this.notifySuccess('Solicitud procesada', 'La resolución quedó registrada y auditada.');
        await this.store.load(this.statusFilter());
      }
    });
  }

  protected openEdit(request: CorrectionRequest): void {
    this.store.clearError();
    this.editModel.set({
      principal: request.loanPrincipal,
      interestRate: request.loanInterestRate,
      frequency: request.loanFrequency,
      installmentCount: request.loanInstallmentCount,
      startedOn: request.loanStartedOn,
      reason: request.reason,
    });
    this.editForm().reset();
    this.editTarget.set(request);
  }

  protected closeEdit(): void {
    if (!this.store.saving()) this.editTarget.set(null);
  }

  protected submitEdit(): void {
    const request = this.editTarget();
    if (!request) return;

    void submit(this.editForm, async () => {
      const values = this.editModel();
      const succeeded = await this.store.resolveEdit({
        requestId: request.id,
        principal: values.principal,
        interestRate: values.interestRate,
        frequency: values.frequency,
        installmentCount: values.installmentCount,
        startedOn: values.startedOn,
        reason: values.reason.trim(),
      });

      if (succeeded) {
        this.editTarget.set(null);
        this.notifySuccess('Préstamo actualizado', 'La edición y la solicitud quedaron auditadas.');
        await this.store.load(this.statusFilter());
      }
    });
  }

  protected requestTypeLabel(type: CorrectionRequestType): string {
    return {
      edit_loan: 'Edición de préstamo',
      void_loan: 'Anulación de préstamo',
      void_payment: 'Anulación de pago',
    }[type];
  }

  protected statusLabel(status: CorrectionRequestStatus): string {
    return { pending: 'Pendiente', resolved: 'Resuelta', rejected: 'Rechazada' }[status];
  }

  protected statusSeverity(status: CorrectionRequestStatus): 'warn' | 'success' | 'danger' {
    return { pending: 'warn', resolved: 'success', rejected: 'danger' }[status] as
      'warn' | 'success' | 'danger';
  }

  private notifySuccess(summary: string, detail: string): void {
    this.messageService.add({ severity: 'success', summary, detail, life: 4000 });
  }
}
