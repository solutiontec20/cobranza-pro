import { inject, Injectable, signal } from '@angular/core';
import { AppError } from '../../../core/errors/app-error';
import {
  LoanDetail,
  RegisterLoanPaymentInput,
  RegisterLoanPaymentResult,
  RenewLoanInput,
  RenewLoanResult,
} from '../../../core/models/loan.model';
import { LOAN_REPOSITORY } from '../../../core/repositories/loan.repository';

/**
 * Loan detail + payment registration for the collector module.
 *
 * Deliberately exposes only `loadDetail`/`registerPayment`/`renew` on top of the shared
 * `LOAN_REPOSITORY` (the same repository/RPCs the admin module uses) — a collector can register
 * a payment or renew a loan for their own portfolio, but must never be able to edit or void a
 * payment. Not exposing `update`/void-related methods here enforces that business rule at the
 * type level.
 */
@Injectable()
export class CollectorLoanStore {
  private readonly repository = inject(LOAN_REPOSITORY);
  private detailRequestSequence = 0;

  readonly detail = signal<LoanDetail | null>(null);
  readonly loadingDetail = signal(false);
  readonly paying = signal(false);
  readonly renewing = signal(false);
  readonly error = signal<string | null>(null);

  async loadDetail(loanId: string): Promise<void> {
    const sequence = ++this.detailRequestSequence;
    this.loadingDetail.set(true);
    this.error.set(null);

    try {
      const detail = await this.repository.getDetail(loanId);
      if (sequence === this.detailRequestSequence) {
        this.detail.set(detail);
      }
    } catch (error) {
      if (sequence === this.detailRequestSequence) {
        this.detail.set(null);
        this.error.set(this.messageFrom(error, 'No se pudo cargar el detalle del préstamo.'));
      }
    } finally {
      if (sequence === this.detailRequestSequence) {
        this.loadingDetail.set(false);
      }
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
        this.detail.set(await this.repository.getDetail(input.loanId));
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
        this.detail.set(await this.repository.getDetail(result.loanId));
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

  private messageFrom(error: unknown, fallback: string): string {
    return AppError.from(error).message || fallback;
  }
}
