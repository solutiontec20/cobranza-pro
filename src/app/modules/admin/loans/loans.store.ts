import { inject, Injectable, signal } from '@angular/core';
import { AppError } from '../../../core/errors/app-error';
import {
  CreateLoanInput,
  LoanClientOption,
  LoanListItem,
} from '../../../core/models/loan.model';
import { LOAN_REPOSITORY } from '../../../core/repositories/loan.repository';

@Injectable()
export class LoansStore {
  private readonly repository = inject(LOAN_REPOSITORY);

  readonly loans = signal<LoanListItem[]>([]);
  readonly availableClients = signal<LoanClientOption[]>([]);
  readonly loading = signal(false);
  readonly creating = signal(false);
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

  clearError(): void {
    this.error.set(null);
  }

  private messageFrom(error: unknown, fallback: string): string {
    return AppError.from(error).message || fallback;
  }
}
