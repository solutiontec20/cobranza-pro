import { computed, inject, Injectable, signal } from '@angular/core';
import { AppError } from '../../../core/errors/app-error';
import {
  CreateLoanInput,
  LoanClientOption,
  LoanDetail,
  LoanFrequency,
  LoanInstallment,
  LoanListItem,
  LoanStatus,
  RegisterLoanPaymentInput,
  RegisterLoanPaymentResult,
  RenewLoanInput,
  RenewLoanResult,
  UpdateLoanInput,
} from '../../../core/models/loan.model';
import { LOAN_REPOSITORY } from '../../../core/repositories/loan.repository';

export type LoanStatusFilter = 'all' | LoanStatus;
export type LoanFrequencyFilter = 'all' | LoanFrequency;

@Injectable()
export class LoansStore {
  private readonly repository = inject(LOAN_REPOSITORY);

  readonly loans = signal<LoanListItem[]>([]);
  readonly availableClients = signal<LoanClientOption[]>([]);
  readonly selectedSchedule = signal<LoanInstallment[]>([]);
  readonly selectedScheduleLoanId = signal<string | null>(null);
  readonly selectedDetail = signal<LoanDetail | null>(null);
  readonly loading = signal(false);
  readonly loadingSchedule = signal(false);
  readonly loadingDetail = signal(false);
  readonly creating = signal(false);
  readonly saving = signal(false);
  readonly paying = signal(false);
  readonly renewing = signal(false);
  readonly error = signal<string | null>(null);

  readonly query = signal('');
  readonly statusFilter = signal<LoanStatusFilter>('all');
  readonly collectorFilter = signal<string | null>(null);
  readonly frequencyFilter = signal<LoanFrequencyFilter>('all');

  readonly collectorOptions = computed(() => {
    const byId = new Map<string, string>();
    for (const loan of this.loans()) {
      byId.set(loan.collectorId, loan.collectorName);
    }
    return [...byId.entries()]
      .map(([id, fullName]) => ({ id, fullName }))
      .sort((left, right) => left.fullName.localeCompare(right.fullName, 'es-PE'));
  });

  readonly filteredLoans = computed(() => {
    const query = this.normalize(this.query());
    const status = this.statusFilter();
    const collectorId = this.collectorFilter();
    const frequency = this.frequencyFilter();

    return this.loans().filter((loan) => {
      if (status !== 'all' && loan.status !== status) return false;
      if (collectorId !== null && loan.collectorId !== collectorId) return false;
      if (frequency !== 'all' && loan.frequency !== frequency) return false;
      if (!query) return true;

      return [loan.clientName, loan.clientDni, loan.collectorName]
        .map((value) => this.normalize(value))
        .some((value) => value.includes(query));
    });
  });

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const [loans, clients] = await Promise.all([
        this.repository.list(),
        this.repository.listAvailableClients(),
      ]);
      this.loans.set(loans);
      this.availableClients.set(clients);
    } catch (error) {
      this.error.set(this.messageFrom(error, 'No se pudo cargar la gestión de préstamos.'));
    } finally {
      this.loading.set(false);
    }
  }

  async create(input: CreateLoanInput): Promise<boolean> {
    this.creating.set(true);
    this.error.set(null);

    try {
      await this.repository.create(input);
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
    this.loadingDetail.set(true);
    this.error.set(null);

    try {
      this.selectedDetail.set(await this.repository.getDetail(loanId));
    } catch (error) {
      this.selectedDetail.set(null);
      this.error.set(this.messageFrom(error, 'No se pudo cargar el detalle del préstamo.'));
    } finally {
      this.loadingDetail.set(false);
    }
  }

  async update(input: UpdateLoanInput): Promise<boolean> {
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
        const [loans, clients, detail] = await Promise.all([
          this.repository.list(),
          this.repository.listAvailableClients(),
          this.repository.getDetail(input.loanId),
        ]);
        this.loans.set(loans);
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

  async renew(input: RenewLoanInput): Promise<RenewLoanResult | null> {
    this.renewing.set(true);
    this.error.set(null);

    try {
      const result = await this.repository.renew(input);

      try {
        const [loans, clients, detail] = await Promise.all([
          this.repository.list(),
          this.repository.listAvailableClients(),
          this.repository.getDetail(result.loanId),
        ]);
        this.loans.set(loans);
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

  clearFilters(): void {
    this.query.set('');
    this.statusFilter.set('all');
    this.collectorFilter.set(null);
    this.frequencyFilter.set('all');
  }

  private messageFrom(error: unknown, fallback: string): string {
    return AppError.from(error).message || fallback;
  }

  private normalize(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('es-PE')
      .trim();
  }
}
