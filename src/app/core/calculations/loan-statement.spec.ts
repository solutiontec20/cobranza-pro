import { describe, expect, it } from 'vitest';

import { LoanDetail, LoanInstallment, LoanPaymentRecord } from '../models/loan.model';
import { buildLoanStatementText, loanStatementFileName } from './loan-statement';

// 2026-11-26 17:40 in Lima (UTC-5).
const ISSUED_AT = new Date('2026-11-26T22:40:00Z');

const installment = (overrides: Partial<LoanInstallment>): LoanInstallment => ({
  id: 'installment',
  loanId: 'loan-1',
  installmentNumber: 1,
  dueDate: '2026-11-20',
  scheduledAmount: 50,
  paidAmount: 0,
  outstandingAmount: 50,
  status: 'pending',
  overdueDays: 0,
  ...overrides,
});

const payment = (overrides: Partial<LoanPaymentRecord>): LoanPaymentRecord => ({
  id: 'payment',
  amount: 50,
  paymentMethod: 'cash',
  paidAt: '2026-11-21T15:30:00Z',
  businessDate: '2026-11-21',
  status: 'posted',
  notes: null,
  collectorId: 'collector-1',
  collectorName: 'Rosa Cobradora',
  voidReason: null,
  ...overrides,
});

const detail = (overrides: Partial<LoanDetail> = {}): LoanDetail => ({
  loan: {
    id: 'loan-1',
    clientId: 'client-1',
    clientName: 'María Quispe Huamán',
    clientDni: '45678912',
    collectorId: 'collector-1',
    collectorName: 'Rosa Cobradora',
    principal: 100,
    interestRate: 20,
    totalAmount: 120,
    installmentAmount: 40,
    installmentCount: 3,
    frequency: 'daily',
    balance: 70,
    status: 'active',
    startedOn: '2026-11-19',
    endDate: '2026-11-22',
    createdAt: '2026-11-19T14:00:00Z',
  },
  client: {
    id: 'client-1',
    dni: '45678912',
    fullName: 'María Quispe Huamán',
    phone: '999888777',
    address: 'Av. Secreta 123',
    notes: 'nota interna del cliente',
    collectorId: 'collector-1',
    collectorName: 'Rosa Cobradora',
  },
  installments: [
    installment({
      id: 'i3',
      installmentNumber: 3,
      dueDate: '2026-11-22',
      scheduledAmount: 40,
      outstandingAmount: 40,
    }),
    installment({
      id: 'i1',
      installmentNumber: 1,
      dueDate: '2026-11-20',
      scheduledAmount: 40,
      paidAmount: 40,
      outstandingAmount: 0,
      status: 'paid',
    }),
    installment({
      id: 'i2',
      installmentNumber: 2,
      dueDate: '2026-11-21',
      scheduledAmount: 40,
      paidAmount: 10,
      outstandingAmount: 30,
      status: 'partial',
    }),
  ],
  payments: [
    payment({ id: 'p2', amount: 10, paidAt: '2026-11-22T16:00:00Z', paymentMethod: 'yape' }),
    payment({ id: 'p1', amount: 40, paidAt: '2026-11-21T15:30:00Z' }),
    payment({
      id: 'p-voided',
      amount: 999,
      status: 'voided',
      voidReason: 'Pago registrado por error',
      paymentMethod: 'plin',
    }),
  ],
  ...overrides,
});

describe('buildLoanStatementText', () => {
  it('shows the full name and DNI but leaves out phone, address, notes and collector', () => {
    const text = buildLoanStatementText(detail(), ISSUED_AT);

    expect(text).toContain('Nombre: María Quispe Huamán');
    expect(text).toContain('DNI: 45678912');
    expect(text).not.toContain('999888777');
    expect(text).not.toContain('Av. Secreta 123');
    expect(text).not.toContain('nota interna');
    expect(text).not.toContain('Rosa Cobradora');
  });

  it('never exposes voided payments, their amounts or their reasons', () => {
    const text = buildLoanStatementText(detail(), ISSUED_AT);

    expect(text).not.toContain('999.00');
    expect(text).not.toContain('Pago registrado por error');
    expect(text).not.toMatch(/anulad/i);
    expect(text).not.toContain('Plin');

    const history = text.slice(text.indexOf('HISTORIAL DE PAGOS'));
    expect(history).toContain('1) ');
    expect(history).toContain('2) ');
    expect(history).not.toContain('3) ');
  });

  it('totals only posted payments and reports the remaining balance', () => {
    const text = buildLoanStatementText(detail(), ISSUED_AT);

    expect(text).toContain('Total pagado: S/ 50.00');
    expect(text).toContain('Saldo pendiente: S/ 70.00');
    expect(text).toContain('Cuotas pagadas: 1 de 3');
  });

  it('orders the schedule by installment number and the payments by date', () => {
    const text = buildLoanStatementText(detail(), ISSUED_AT);

    expect(text.indexOf('01) 20/11/2026')).toBeLessThan(text.indexOf('02) 21/11/2026'));
    expect(text.indexOf('02) 21/11/2026')).toBeLessThan(text.indexOf('03) 22/11/2026'));
    expect(text.indexOf('1) 21/11/2026')).toBeLessThan(text.indexOf('2) 22/11/2026'));
  });

  it('adds paid and missing amounts only for partially paid installments', () => {
    const text = buildLoanStatementText(detail(), ISSUED_AT);

    expect(text).toContain(
      '02) 21/11/2026 - S/ 40.00 - Pago parcial\n    Pagado S/ 10.00 | Falta S/ 30.00',
    );
    expect(text).toContain('01) 20/11/2026 - S/ 40.00 - Pagada\n02)');
    expect(text).toContain('03) 22/11/2026 - S/ 40.00 - Pendiente\n');
  });

  it('describes overdue installments with their days late', () => {
    const text = buildLoanStatementText(
      detail({
        installments: [
          installment({ status: 'overdue', overdueDays: 1 }),
          installment({ installmentNumber: 2, status: 'overdue', overdueDays: 3 }),
        ],
      }),
      ISSUED_AT,
    );

    expect(text).toContain('Vencida hace 1 día');
    expect(text).toContain('Vencida hace 3 días');
  });

  it('prints the issue time in Lima and a clear message when there are no payments', () => {
    const text = buildLoanStatementText(detail({ payments: [] }), ISSUED_AT);

    expect(text).toContain('Emitido: 26/11/2026 17:40 (hora de Lima)');
    expect(text).toContain('Sin pagos registrados.');
    expect(text).toContain('Total pagado: S/ 0.00');
  });
});

describe('loanStatementFileName', () => {
  it('uses the DNI and the Lima issue date', () => {
    expect(loanStatementFileName(detail(), ISSUED_AT)).toBe(
      'estado-de-cuenta_45678912_2026-11-26.txt',
    );
  });

  it('keeps only safe characters from the DNI', () => {
    const base = detail();
    const unsafe = { ...base, client: { ...base.client, dni: '../4567 8912' } };

    expect(loanStatementFileName(unsafe, ISSUED_AT)).toBe(
      'estado-de-cuenta_45678912_2026-11-26.txt',
    );
  });

  it('uses the Lima day when UTC has already moved to the next one', () => {
    expect(loanStatementFileName(detail(), new Date('2026-11-27T03:00:00Z'))).toContain(
      '2026-11-26',
    );
  });
});
