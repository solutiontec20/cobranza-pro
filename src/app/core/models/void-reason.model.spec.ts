import {
  LOAN_VOID_REASON_OPTIONS,
  PAYMENT_VOID_REASON_OPTIONS,
  resolveVoidReason,
} from './void-reason.model';

describe('void reasons', () => {
  it('keeps Other as the final option in both catalogs', () => {
    expect(PAYMENT_VOID_REASON_OPTIONS.at(-1)).toEqual({ label: 'Otro', value: 'other' });
    expect(LOAN_VOID_REASON_OPTIONS.at(-1)).toEqual({ label: 'Otro', value: 'other' });
  });

  it('resolves predefined reasons to their auditable label', () => {
    expect(resolveVoidReason('payment_duplicate', '')).toBe('Pago registrado por duplicado');
    expect(resolveVoidReason('loan_not_disbursed', '')).toBe('Desembolso no realizado');
  });

  it('requires and trims the explanation when Other is selected', () => {
    expect(resolveVoidReason('other', '   ')).toBeNull();
    expect(resolveVoidReason('other', '  El cliente desconoció el desembolso  ')).toBe(
      'El cliente desconoció el desembolso',
    );
  });
});
