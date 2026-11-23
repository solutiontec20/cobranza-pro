import { inject, Injectable, signal } from '@angular/core';
import { AppError } from '../../../core/errors/app-error';
import {
  BulkVoidLoanPaymentsInput,
  BulkVoidLoanPaymentsResult,
  CreateLoanInput,
  LoanClientOption,
  LoanCollectorOption,
  LoanDetail,
  LoanFrequency,
  LoanInstallment,
  LoanListItem,
  LoanListQuery,
  LoanStatus,
  RegisterLoanPaymentInput,
  RegisterLoanPaymentResult,
  RenewLoanInput,
  RenewLoanResult,
  UpdateLoanInput,
  VoidLoanPaymentInput,
} from '../../../core/models/loan.model';
import { LOAN_REPOSITORY } from '../../../core/repositories/loan.repository';

export type LoanStatusFilter = 'all' | LoanStatus;
export type LoanFrequencyFilter = 'all' | LoanFrequency;

@Injectable()
export class LoansStore {
  private readonly repository = inject(LOAN_REPOSITORY);
  private detailRequestSequence = 0;
  private pageRequestSequence = 0;

  readonly loans = signal<LoanListItem[]>([]);
  readonly availableClients = signal<LoanClientOption[]>([]);
  readonly collectorOptions = signal<LoanCollectorOption[]>([]);
  readonly selectedSchedule = signal<LoanInstallment[]>([]);
  readonly selectedScheduleLoanId = signal<string | null>(null);
  readonly selectedDetail = signal<LoanDetail | null>(null);
  readonly loading = signal(false);
  readonly loadingSchedule = signal(false);
  readonly loadingDetail = signal(false);
  readonly creating = signal(false);
  readonly saving = signal(false);
  readonly paying = signal(false);
  readonly voidingPayment = signal(false);
  readonly renewing = signal(false);
  readonly error = signal<string | null>(null);

  readonly query = signal('');
  readonly statusFilter = signal<LoanStatusFilter>('all');
  readonly collectorFilter = signal<string | null>(null);
  readonly frequencyFilter = signal<LoanFrequencyFilter>('all');
  readonly pageIndex = signal(0);
  readonly pageSize = signal(10);
  readonly totalRecords = signal(0);

  async load(): Promise<void> {
    const requestSequence = ++this.pageRequestSequence;
    this.loading.set(true);
    this.error.set(null);

    try {
      const [page, clients, collectors] = await Promise.all([
        this.repository.listPage(this.pageQuery()),
        this.repository.listAvailableClients(),
        this.repository.listCollectorOptions(),
      ]);
      if (requestSequence !== this.pageRequestSequence) return;
      this.applyPage(page);
      this.availableClients.set(clients);
      this.collectorOptions.set(collectors);
    } catch (error) {
      if (requestSequence !== this.pageRequestSequence) return;
      this.loans.set([]);
      this.totalRecords.set(0);
      this.error.set(this.messageFrom(error, 'No se pudo cargar la gestión de préstamos.'));
    } finally {
      if (requestSequence === this.pageRequestSequence) this.loading.set(false);
    }
  }

  async loadPage(): Promise<void> {
    const requestSequence = ++this.pageRequestSequence;
    this.loading.set(true);
    this.error.set(null);

    try {
      const page = await this.repository.listPage(this.pageQuery());
      if (requestSequence !== this.pageRequestSequence) return;
      this.applyPage(page);
    } catch (error) {
      if (requestSequence !== this.pageRequestSequence) return;
      this.loans.set([]);
      this.totalRecords.set(0);
      this.error.set(this.messageFrom(error, 'No se pudo cargar la gestión de préstamos.'));
    } finally {
      if (requestSequence === this.pageRequestSequence) this.loading.set(false);
    }
  }

  async setSearch(search: string): Promise<void> {
    const normalized = search.trim();
    if (normalized === this.query()) return;
    this.query.set(normalized);
    this.pageIndex.set(0);
    await this.loadPage();
  }

  async setStatusFilter(status: LoanStatusFilter): Promise<void> {
    if (status === this.statusFilter()) return;
    this.statusFilter.set(status);
    this.pageIndex.set(0);
    await this.loadPage();
  }

  async setCollectorFilter(collectorId: string | null): Promise<void> {
    if (collectorId === this.collectorFilter()) return;
    this.collectorFilter.set(collectorId);
    this.pageIndex.set(0);
    await this.loadPage();
  }

  async setFrequencyFilter(frequency: LoanFrequencyFilter): Promise<void> {
    if (frequency === this.frequencyFilter()) return;
    this.frequencyFilter.set(frequency);
    this.pageIndex.set(0);
    await this.loadPage();
  }

  async setPage(first: number, rows: number): Promise<void> {
    const pageSize = Math.min(100, Math.max(1, rows));
    const pageIndex = Math.max(0, Math.floor(first / pageSize));
    if (pageSize === this.pageSize() && pageIndex === this.pageIndex()) return;
    this.pageSize.set(pageSize);
    this.pageIndex.set(pageIndex);
    await this.loadPage();
  }

  async create(input: CreateLoanInput): Promise<boolean> {
    this.creating.set(true);
    this.error.set(null);

    try {
      await this.repository.create(input);
      this.pageIndex.set(0);
      await this.load();
      return this.error() === null;
    } catch (error) {
      this.error.set(this.messageFrom(error, 'No se pudo crear el préstamo.'));
      return false;
    } finally {
      this.creating.set(false);
    }
  }

  async loadSchedule(loanId: string): Promise<void> {
    this.loadingSchedule.set(true);
    this.error.set(null);
    this.selectedScheduleLoanId.set(loanId);

    try {
      this.selectedSchedule.set(await this.repository.getSchedule(loanId));
    } catch (error) {
      this.selectedSchedule.set([]);
      this.error.set(this.messageFrom(error, 'No se pudo cargar el cronograma de pagos.'));
    } finally {
      this.loadingSchedule.set(false);
    }
  }

  async loadDetail(loanId: string): Promise<void> {
    const sequence = ++this.detailRequestSequence;
    this.loadingDetail.set(true);
    this.error.set(null);

    try {
      const detail = await this.repository.getDetail(loanId);
      if (sequence === this.detailRequestSequence) {
        this.selectedDetail.set(detail);
      }
    } catch (error) {
      if (sequence === this.detailRequestSequence) {
        this.selectedDetail.set(null);
        this.error.set(this.messageFrom(error, 'No se pudo cargar el detalle del préstamo.'));
      }
    } finally {
      if (sequence === this.detailRequestSequence) {
        this.loadingDetail.set(false);
      }
    }
  }

  async update(input: UpdateLoanInput): Promise<boolean> {
    const current =
      this.selectedDetail()?.loan.id === input.loanId
        ? this.selectedDetail()?.loan
        : this.loans().find((loan) => loan.id === input.loanId);
    if (
      current &&
      current.principal === input.principal &&
      current.interestRate === input.interestRate &&
      current.frequency === input.frequency &&
      current.installmentCount === input.installmentCount &&
      current.startedOn === input.startedOn
    ) {
      return false;
    }

    this.saving.set(true);
    this.error.set(null);

    try {
      await this.repository.update(input);
      await this.load();

      if (this.error() !== null) {
        return false;
      }

      if (this.selectedScheduleLoanId() === input.loanId) {
        await this.loadSchedule(input.loanId);
      }

      if (this.selectedDetail()?.loan.id === input.loanId) {
        await this.loadDetail(input.loanId);
      }

      return this.error() === null;
    } catch (error) {
      this.error.set(this.messageFrom(error, 'No se pudo editar el préstamo.'));
      return false;
    } finally {
      this.saving.set(false);
    }
  }

  async registerPayment(
    input: RegisterLoanPaymentInput,
  ): Promise<RegisterLoanPaymentResult | null> {
    this.paying.set(true);
    this.error.set(null);

    try {
      const result = await this.repository.registerPayment(input);

      try {
        const [page, clients, detail] = await Promise.all([
          this.repository.listPage(this.pageQuery()),
          this.repository.listAvailableClients(),
          this.repository.getDetail(input.loanId),
        ]);
        this.applyPage(page);
        this.availableClients.set(clients);
        this.selectedDetail.set(detail);
      } catch (error) {
        this.error.set(
          `El pago se registró, pero no se pudo actualizar la información. ${this.messageFrom(error, '')}`.trim(),
        );
      }

      return result;
    } catch (error) {
      this.error.set(this.messageFrom(error, 'No se pudo registrar el pago.'));
      return null;
    } finally {
      this.paying.set(false);
    }
  }

  async voidPayment(input: VoidLoanPaymentInput): Promise<boolean> {
    this.voidingPayment.set(true);
    this.error.set(null);

    try {
      await this.repository.voidPayment(input);
      const [page, detail] = await Promise.all([
        this.repository.listPage(this.pageQuery()),
        this.repository.getDetail(input.loanId),
      ]);
      this.applyPage(page);
      this.selectedDetail.set(detail);
      return true;
    } catch (error) {
      this.error.set(this.messageFrom(error, 'No se pudo anular el pago.'));
      return false;
    } finally {
      this.voidingPayment.set(false);
    }
  }

  async voidPaymentsBulk(
    input: BulkVoidLoanPaymentsInput,
  ): Promise<BulkVoidLoanPaymentsResult | null> {
    this.voidingPayment.set(true);
    this.error.set(null);

    try {
      const result = await this.repository.voidPaymentsBulk(input);

      try {
        const [page, detail] = await Promise.all([
          this.repository.listPage(this.pageQuery()),
          this.repository.getDetail(input.loanId),
        ]);
        this.applyPage(page);
        this.selectedDetail.set(detail);
      } catch (error) {
        this.error.set(
          `Los pagos se anularon, pero no se pudo actualizar la información. ${this.messageFrom(error, '')}`.trim(),
        );
      }

      return result;
    } catch (error) {
      this.error.set(this.messageFrom(error, 'No se pudieron anular los pagos seleccionados.'));
      return null;
    } finally {
      this.voidingPayment.set(false);
    }
  }

  async renew(input: RenewLoanInput): Promise<RenewLoanResult | null> {
    this.renewing.set(true);
    this.error.set(null);

    try {
      const result = await this.repository.renew(input);

      try {
        const [page, clients, detail] = await Promise.all([
          this.repository.listPage(this.pageQuery()),
          this.repository.listAvailableClients(),
          this.repository.getDetail(result.loanId),
        ]);
        this.applyPage(page);
        this.availableClients.set(clients);
        this.selectedDetail.set(detail);
      } catch (error) {
        this.error.set(
          `El préstamo se renovó, pero no se pudo actualizar la información. ${this.messageFrom(error, '')}`.trim(),
        );
      }

      return result;
    } catch (error) {
      this.error.set(this.messageFrom(error, 'No se pudo renovar el préstamo.'));
      return null;
    } finally {
      this.renewing.set(false);
    }
  }

  clearError(): void {
    this.error.set(null);
  }

  async clearFilters(): Promise<void> {
    const alreadyClear =
      this.query() === '' &&
      this.statusFilter() === 'all' &&
      this.collectorFilter() === null &&
      this.frequencyFilter() === 'all' &&
      this.pageIndex() === 0;
    if (alreadyClear) return;

    this.query.set('');
    this.statusFilter.set('all');
    this.collectorFilter.set(null);
    this.frequencyFilter.set('all');
    this.pageIndex.set(0);
    await this.loadPage();
  }

  private pageQuery(): LoanListQuery {
    const status = this.statusFilter();
    const frequency = this.frequencyFilter();
    return {
      pageIndex: this.pageIndex(),
      pageSize: this.pageSize(),
      search: this.query(),
      status: status === 'all' ? null : status,
      collectorId: this.collectorFilter(),
      frequency: frequency === 'all' ? null : frequency,
    };
  }

  private applyPage(page: { items: LoanListItem[]; total: number }): void {
    this.loans.set(page.items);
    this.totalRecords.set(page.total);
  }

  private messageFrom(error: unknown, fallback: string): string {
    return AppError.from(error).message || fallback;
  }
}
