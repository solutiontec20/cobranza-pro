export type LoanEditReasonCode =
  | 'amount_error'
  | 'rate_error'
  | 'installment_count_error'
  | 'frequency_error'
  | 'start_date_error'
  | 'other';

export type CorrectionRejectionReasonCode =
  | 'insufficient_information'
  | 'data_mismatch'
  | 'duplicate_request'
  | 'correction_rules_not_met'
  | 'other';

interface CorrectionReasonOption<TCode extends string> {
  label: string;
  value: TCode;
}

export const LOAN_EDIT_REASON_OPTIONS: Array<CorrectionReasonOption<LoanEditReasonCode>> = [
  { label: 'Error en el importe', value: 'amount_error' },
  { label: 'Error en la tasa', value: 'rate_error' },
  { label: 'Error en el número de cuotas', value: 'installment_count_error' },
  { label: 'Error en la frecuencia', value: 'frequency_error' },
  { label: 'Error en la fecha del préstamo', value: 'start_date_error' },
  { label: 'Otro', value: 'other' },
];

export const CORRECTION_REJECTION_REASON_OPTIONS: Array<
  CorrectionReasonOption<CorrectionRejectionReasonCode>
> = [
  { label: 'Información insuficiente', value: 'insufficient_information' },
  { label: 'Los datos no coinciden con los registros', value: 'data_mismatch' },
  { label: 'Solicitud duplicada', value: 'duplicate_request' },
  {
    label: 'La solicitud no cumple las reglas de corrección',
    value: 'correction_rules_not_met',
  },
  { label: 'Otro', value: 'other' },
];

function resolveCorrectionReason<TCode extends string>(
  options: Array<CorrectionReasonOption<TCode>>,
  code: TCode | '',
  customReason: string,
): string | null {
  if (code === 'other') {
    return customReason.trim() || null;
  }

  return options.find((option) => option.value === code)?.label ?? null;
}

export function resolveLoanEditReason(
  code: LoanEditReasonCode | '',
  customReason: string,
): string | null {
  return resolveCorrectionReason(LOAN_EDIT_REASON_OPTIONS, code, customReason);
}

export function resolveCorrectionRejectionReason(
  code: CorrectionRejectionReasonCode | '',
  customReason: string,
): string | null {
  return resolveCorrectionReason(CORRECTION_REJECTION_REASON_OPTIONS, code, customReason);
}
