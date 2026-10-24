import { resolveLoanEditReason } from './loan-edit-reasons';

describe('loan edit reasons', () => {
  it('resolves predefined reasons to their audit message', () => {
    expect(resolveLoanEditReason('amount_error', '')).toBe('Error en el importe');
    expect(resolveLoanEditReason('rate_error', '')).toBe('Error en la tasa');
    expect(resolveLoanEditReason('installment_count_error', '')).toBe(
      'Error en el número de cuotas',
    );
  });

  it('requires and trims a custom justification for other', () => {
    expect(resolveLoanEditReason('other', '   ')).toBeNull();
    expect(resolveLoanEditReason('other', '  Corrección solicitada por el cliente  ')).toBe(
      'Corrección solicitada por el cliente',
    );
  });
});
