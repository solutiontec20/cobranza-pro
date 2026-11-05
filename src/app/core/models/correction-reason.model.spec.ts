import {
  CORRECTION_REJECTION_REASON_OPTIONS,
  LOAN_EDIT_REASON_OPTIONS,
  resolveCorrectionRejectionReason,
  resolveLoanEditReason,
} from './correction-reason.model';

describe('correction reasons', () => {
  it('keeps Other as the final option in edit and rejection catalogs', () => {
    expect(LOAN_EDIT_REASON_OPTIONS.at(-1)).toEqual({ label: 'Otro', value: 'other' });
    expect(CORRECTION_REJECTION_REASON_OPTIONS.at(-1)).toEqual({
      label: 'Otro',
      value: 'other',
    });
  });

  it('covers every editable loan condition with a quick reason', () => {
    expect(resolveLoanEditReason('amount_error', '')).toBe('Error en el importe');
    expect(resolveLoanEditReason('rate_error', '')).toBe('Error en la tasa');
    expect(resolveLoanEditReason('installment_count_error', '')).toBe(
      'Error en el número de cuotas',
    );
    expect(resolveLoanEditReason('frequency_error', '')).toBe('Error en la frecuencia');
    expect(resolveLoanEditReason('start_date_error', '')).toBe('Error en la fecha del préstamo');
  });

  it('resolves predefined rejection reasons to their auditable labels', () => {
    expect(resolveCorrectionRejectionReason('insufficient_information', '')).toBe(
      'Información insuficiente',
    );
    expect(resolveCorrectionRejectionReason('correction_rules_not_met', '')).toBe(
      'La solicitud no cumple las reglas de corrección',
    );
  });

  it('requires and trims the explanation when Other is selected', () => {
    expect(resolveLoanEditReason('other', '   ')).toBeNull();
    expect(resolveCorrectionRejectionReason('other', '  Rechazo por validación externa  ')).toBe(
      'Rechazo por validación externa',
    );
  });
});
