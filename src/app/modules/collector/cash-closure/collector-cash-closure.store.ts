import { computed, inject, Injectable, signal } from '@angular/core';
import { calculateExpectedCash } from '../../../core/calculations/cash-closure-calculations';
import { AppError } from '../../../core/errors/app-error';
import {
  CollectorCashDay,
  RequestCashExpenseInput,
} from '../../../core/models/cash-closure.model';
import { CASH_CLOSURE_REPOSITORY } from '../../../core/repositories/cash-closure.repository';

function currentLimaDate(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value['year']}-${value['month']}-${value['day']}`;
}

/**
 * The collector's own daily cash closure screen: view today's breakdown, request expenses,
 * and submit the closure. Registering the opening float/allowance and reviewing expenses are
 * admin/supervisor-only actions (see `modules/admin/cash-closure/cash-closure.store.ts`).
 */
@Injectable()
export class CollectorCashClosureStore {
  private readonly repository = inject(CASH_CLOSURE_REPOSITORY);

  readonly businessDate = signal(currentLimaDate());
  readonly day = signal<CollectorCashDay | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  readonly expectedCash = computed(() => {
    const day = this.day();
    return day ? calculateExpectedCash(day.breakdown) : 0;
  });

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      this.day.set(await this.repository.getOwnDay(this.businessDate()));
    } catch (error) {
      this.error.set(this.messageFrom(error, 'No se pudo cargar el cierre de caja.'));
    } finally {
      this.loading.set(false);
    }
  }

  async requestExpense(input: Omit<RequestCashExpenseInput, 'collectorId' | 'businessDate'>): Promise<boolean> {
    this.saving.set(true);
    this.error.set(null);

    try {
      await this.repository.requestExpense({ ...input, businessDate: this.businessDate() });
      await this.load();
      return this.error() === null;
    } catch (error) {
      this.error.set(this.messageFrom(error, 'No se pudo registrar el gasto.'));
      return false;
    } finally {
      this.saving.set(false);
    }
  }

  async submitClosure(deliveredAmount: number, observation: string): Promise<boolean> {
    this.saving.set(true);
    this.error.set(null);

    try {
      await this.repository.submitClosure({
        businessDate: this.businessDate(),
        deliveredAmount,
        observation,
      });
      await this.load();
      return this.error() === null;
    } catch (error) {
      this.error.set(this.messageFrom(error, 'No se pudo enviar el cierre de caja.'));
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
