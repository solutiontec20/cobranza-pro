import { DailyControlRow } from '../../../core/models/daily-control.model';
import { toDailyControlCsv } from './daily-control-export.service';

describe('toDailyControlCsv', () => {
  it('creates an Excel-friendly UTF-8 CSV and escapes text safely', () => {
    const row: DailyControlRow = {
      loanId: 'loan-1', clientId: 'client-1', clientDni: '45678901',
      clientName: 'María "Majo" López', collectorId: 'collector-1', collectorName: 'José Pérez',
      principalAmount: 300, totalAmount: 360, startedOn: '2026-10-01', endDate: '2026-10-30',
      installmentAmount: 12, scheduledOnDate: 12, collectedOnDate: 8.5, paidToDate: 180,
      balanceAsOf: 180, oldestUnpaidDueDate: '2026-10-18', overdueDays: 3, status: 'overdue',
    };

    const csv = toDailyControlCsv([row]);

    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"María ""Majo"" López"');
    expect(csv).toContain('"8.50"');
    expect(csv).toContain('"Con atraso"');
    expect(csv.endsWith('\r\n')).toBe(true);
  });
});
