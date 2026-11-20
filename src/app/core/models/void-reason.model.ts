export type VoidReasonCode =
  | 'payment_duplicate'
  | 'payment_amount_error'
  | 'payment_wrong_assignment'
  | 'payment_method_error'
  | 'loan_created_error'
  | 'loan_wrong_customer'
  | 'loan_terms_error'
  | 'loan_not_disbursed'
  | 'other';

export interface VoidReasonOption {
  label: string;
  value: VoidReasonCode;
}

export const PAYMENT_VOID_REASON_OPTIONS: VoidReasonOption[] = [
  { label: 'Pago registrado por duplicado', value: 'payment_duplicate' },
  { label: 'Monto registrado incorrecto', value: 'payment_amount_error' },
  {
    label: 'Pago asignado al cliente o préstamo equivocado',
    value: 'payment_wrong_assignment',
  },
  { label: 'Medio de pago incorrecto', value: 'payment_method_error' },
  { label: 'Otro', value: 'other' },
];

export const LOAN_VOID_REASON_OPTIONS: VoidReasonOption[] = [
  { label: 'Préstamo registrado por error', value: 'loan_created_error' },
  { label: 'Préstamo asignado al cliente equivocado', value: 'loan_wrong_customer' },
  { label: 'Monto o condiciones incorrectas', value: 'loan_terms_error' },
  { label: 'Desembolso no realizado', value: 'loan_not_disbursed' },
  { label: 'Otro', value: 'other' },
];

const ALL_VOID_REASON_OPTIONS = [...PAYMENT_VOID_REASON_OPTIONS, ...LOAN_VOID_REASON_OPTIONS];

export function resolveVoidReason(code: VoidReasonCode | '', customReason: string): string | null {
  if (code === 'other') {
    return customReason.trim() || null;
  }

  return ALL_VOID_REASON_OPTIONS.find((option) => option.value === code)?.label ?? null;
}
