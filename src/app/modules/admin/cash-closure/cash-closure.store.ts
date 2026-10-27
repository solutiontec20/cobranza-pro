import { computed, inject, Injectable, signal } from '@angular/core';
import { calculateExpectedCash } from '../../../core/calculations/cash-closure-calculations';
import { currentLimaDate } from '../../../core/calculations/date-time';
import { AppError } from '../../../core/errors/app-error';
import {
  CollectorCashDay,
  RegisterCashAllowanceInput,
  RegisterCashOpeningInput,
  RequestCashExpenseInput,
  ReviewCashExpenseInput,
} from '../../../core/models/cash-closure.model';
import { CASH_CLOSURE_REPOSITORY } from '../../../core/repositories/cash-closure.repository';

/**
 * Admin/supervisor overview of every active collector's cash closure for a given business date:
 * register opening float/allowances, review expense requests, and validate submitted closures.
 */
@Injectable()
export class CashClosureStore {
  private readonly repository = inject(CASH_CLOSURE_REPOSITORY);

  readonly businessDate = signal(currentLimaDate());
  readonly days = signal<CollectorCashDay[]>([]);
  readonly selectedCollectorId = signal<string | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  readonly selectedDay = computed(() => {
    const id = this.selectedCollectorId();
    return id ? this.days().find((day) => day.collectorId === id) ?? null : null;
  });
  readonly selectedExpectedCash = computed(() => {
    const day = this.selectedDay();
    return day ? calculateExpectedCash(day.breakdown) : 0;
  });
  readonly pendingExpenseCount = computed(() =>
    this.days().reduce(
      (total, day) => total + day.expenses.filter((expense) => expense.status === 'pending').length,
      0,
    ),
  );

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const days = await this.repository.listDay(this.businessDate());
      this.days.set(days);
      if (this.selectedCollectorId() === null && days.length > 0) {
        this.selectedCollectorId.set(days[0].collectorId);
      }
    } catch (error) {
      this.error.set(this.messageFrom(error, 'No se pudo cargar el cierre de caja.'));
    } finally {
      this.loading.set(false);
    }
  }

  setBusinessDate(businessDate: string): void {
    this.businessDate.set(businessDate);
    void this.load();
  }

  selectCollector(collectorId: string): void {
    this.selectedCollectorId.set(collectorId);
    this.clearError();
  }

  async registerOpening(input: Omit<RegisterCashOpeningInput, 'businessDate'>): Promise<boolean> {
    return this.mutate(() =>
      this.repository.registerOpening({ ...input, businessDate: this.businessDate() }),
    );
  }

  async registerAllowance(input: Omit<RegisterCashAllowanceInput, 'businessDate'>): Promise<boolean> {
    return this.mutate(() =>
      this.repository.registerAllowance({ ...input, businessDate: this.businessDate() }),
    );
  }

  async requestExpense(input: Omit<RequestCashExpenseInput, 'businessDate'>): Promise<boolean> {
    return this.mutate(() =>
      this.repository.requestExpense({ ...input, businessDate: this.businessDate() }),
    );
  }

  async reviewExpense(input: ReviewCashExpenseInput): Promise<boolean> {
    return this.mutate(() => this.repository.reviewExpense(input));
  }

  async validateClosure(closureId: string, observation: string): Promise<boolean> {
    return this.mutate(() => this.repository.validateClosure({ closureId, observation }));
  }

  clearError(): void {
    this.error.set(null);
  }

  private async mutate(action: () => Promise<unknown>): Promise<boolean> {
    this.saving.set(true);
    this.error.set(null);

    try {
      await action();
      await this.load();
      return this.error() === null;
    } catch (error) {
      this.error.set(this.messageFrom(error, 'No se pudo completar la operación.'));
      return false;
    } finally {
      this.saving.set(false);
    }
  }

  private messageFrom(error: unknown, fallback: string): string {
    return AppError.from(error).message || fallback;
  }
}
