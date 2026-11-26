import { LoanDetail, LoanFrequency, LoanInstallment, LoanStatus } from '../models/loan.model';
import { formatEsDate, parseDateValue, toIsoDateLima } from './date-time';
import { calculateLoanPaymentSummary } from './loan-payment-calculations';

const SEPARATOR = '-'.repeat(32);
const MONEY = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' });

const FREQUENCY_LABELS: Record<LoanFrequency, string> = {
  daily: 'Diario',
  weekly: 'Semanal',
  monthly: 'Mensual',
};

const STATUS_LABELS: Record<LoanStatus, string> = {
  active: 'Activo',
  paid: 'Pagado',
  renewed: 'Renovado',
  voided: 'Anulado',
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  yape: 'Yape',
  plin: 'Plin',
  transfer: 'Transferencia',
};

// Non-breaking spaces from Intl would render as odd characters in some SMS/email clients.
const formatMoney = (value: number): string => MONEY.format(value).replace(/\u00a0/g, ' ');

function installmentStatusLabel(installment: LoanInstallment): string {
  switch (installment.status) {
    case 'paid':
      return 'Pagada';
    case 'partial':
      return 'Pago parcial';
    case 'overdue':
      return installment.overdueDays > 0
        ? `Vencida hace ${installment.overdueDays} ${installment.overdueDays === 1 ? 'día' : 'días'}`
        : 'Vencida';
    default:
      return 'Pendiente';
  }
}

function installmentLines(installment: LoanInstallment, numberWidth: number): string[] {
  const number = String(installment.installmentNumber).padStart(numberWidth, '0');
  const lines = [
    `${number}) ${formatEsDate(installment.dueDate, 'short')} - ${formatMoney(installment.scheduledAmount)} - ${installmentStatusLabel(installment)}`,
  ];

  if (installment.paidAmount > 0 && installment.outstandingAmount > 0) {
    lines.push(
      `    Pagado ${formatMoney(installment.paidAmount)} | Falta ${formatMoney(installment.outstandingAmount)}`,
    );
  }

  return lines;
}

/**
 * Plain-text account statement meant to be shared with the customer (WhatsApp, e-mail, SMS) or
 * saved as a `.txt` file. It intentionally leaves out the phone, address, notes, collector and every
 * voided payment: voided records stay in the audited history but must not confuse the customer.
 */
export function buildLoanStatementText(detail: LoanDetail, issuedAt: Date): string {
  const { loan, client } = detail;
  const installments = [...detail.installments].sort(
    (a, b) => a.installmentNumber - b.installmentNumber,
  );
  const payments = detail.payments
    .filter((payment) => payment.status === 'posted')
    .sort((a, b) => parseDateValue(a.paidAt).getTime() - parseDateValue(b.paidAt).getTime());

  const summary = calculateLoanPaymentSummary(loan.totalAmount, payments);
  const paidInstallments = installments.filter((installment) => installment.status === 'paid');
  const numberWidth = Math.max(2, String(installments.length).length);

  const lines: string[] = [
    'ESTADO DE CUENTA DEL PRÉSTAMO',
    'CobranzaPro',
    `Emitido: ${formatEsDate(issuedAt, 'short-datetime')} (hora de Lima)`,
    '',
    SEPARATOR,
    'CLIENTE',
    `Nombre: ${client.fullName}`,
    `DNI: ${client.dni}`,
    '',
    SEPARATOR,
    'PRÉSTAMO',
    `Estado: ${STATUS_LABELS[loan.status]}`,
    `Frecuencia: ${FREQUENCY_LABELS[loan.frequency]}`,
    `Monto prestado: ${formatMoney(loan.principal)}`,
    `Interés (${loan.interestRate}%): ${formatMoney(loan.totalAmount - loan.principal)}`,
    `Total a pagar: ${formatMoney(loan.totalAmount)}`,
    `Valor de cuota: ${formatMoney(loan.installmentAmount)}`,
    `Cuotas: ${loan.installmentCount}`,
    `Fecha del préstamo: ${formatEsDate(loan.startedOn, 'short')}`,
    `Fecha de fin: ${formatEsDate(loan.endDate, 'short')}`,
    '',
    SEPARATOR,
    'RESUMEN',
    `Total pagado: ${formatMoney(summary.paidAmount)}`,
    `Saldo pendiente: ${formatMoney(summary.remainingBalance)}`,
    `Cuotas pagadas: ${paidInstallments.length} de ${installments.length}`,
    '',
    SEPARATOR,
    'CRONOGRAMA DE CUOTAS',
  ];

  if (installments.length === 0) {
    lines.push('Sin cuotas registradas.');
  }
  for (const installment of installments) {
    lines.push(...installmentLines(installment, numberWidth));
  }

  lines.push('', SEPARATOR, 'HISTORIAL DE PAGOS');

  if (payments.length === 0) {
    lines.push('Sin pagos registrados.');
  }
  payments.forEach((payment, index) => {
    const method = PAYMENT_METHOD_LABELS[payment.paymentMethod] ?? payment.paymentMethod;
    lines.push(
      `${index + 1}) ${formatEsDate(payment.paidAt, 'short-datetime')} - ${formatMoney(payment.amount)} - ${method}`,
    );
  });

  return `${lines.join('\n')}\n`;
}

export function loanStatementFileName(detail: LoanDetail, issuedAt: Date): string {
  const dni = detail.client.dni.replace(/[^A-Za-z0-9]/g, '');
  return `estado-de-cuenta_${dni}_${toIsoDateLima(issuedAt)}.txt`;
}
