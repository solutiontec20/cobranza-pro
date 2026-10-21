export type LoanEditReasonCode =
  | 'amount_error'
  | 'rate_error'
  | 'installment_count_error'
  | 'other';

export const LOAN_EDIT_REASON_OPTIONS: Array<{
  label: string;
  value: LoanEditReasonCode;
}> = [
  { label: 'Error en el importe', value: 'amount_error' },
  { label: 'Error en la tasa', value: 'rate_error' },
  { label: 'Error en el número de cuotas', value: 'installment_count_error' },
  { label: 'Otro', value: 'other' },
];

export function resolveLoanEditReason(
  code: LoanEditReasonCode | '',
  customReason: string,
): string | null {
  if (code === 'other') {
    return customReason.trim() || null;
  }

  return LOAN_EDIT_REASON_OPTIONS.find((option) => option.value === code)?.label ?? null;
}
