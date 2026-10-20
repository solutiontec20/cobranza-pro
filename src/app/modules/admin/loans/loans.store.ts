import { inject, Injectable, signal } from '@angular/core';
import { AppError } from '../../../core/errors/app-error';
import {
  CreateLoanInput,
  LoanClientOption,
  LoanInstallment,
  LoanListItem,
  UpdateLoanInput,
} from '../../../core/models/loan.model';
import { LOAN_REPOSITORY } from '../../../core/repositories/loan.repository';

@Injectable()
export class LoansStore {
  private readonly repository = inject(LOAN_REPOSITORY);

  readonly loans = signal<LoanListItem[]>([]);
  readonly availableClients = signal<LoanClientOption[]>([]);
  readonly selectedSchedule = signal<LoanInstallment[]>([]);
  readonly selectedScheduleLoanId = signal<string | null>(null);
  readonly loading = signal(false);
  readonly loadingSchedule = signal(false);
  readonly creating = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

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

      return this.error() === null;
    } catch (error) {
      this.error.set(this.messageFrom(error, 'No se pudo editar el préstamo.'));
      return false;
    } finally {
      this.saving.set(false);
    }
  }

  clearError(): void {
    this.error.set(null);
  }

  private messageFrom(error: unknown, fallback: string): string {
    return AppError.from(error).message || fallback;
  }
}
