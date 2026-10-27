import { InMemoryDailyControlRepository, calendarDaysBetween } from './in-memory-daily-control.repository';

describe('InMemoryDailyControlRepository', () => {
  let repository: InMemoryDailyControlRepository;

  beforeEach(() => {
    repository = new InMemoryDailyControlRepository();
  });

  it('counts overdue time in calendar days from the oldest unpaid due installment', async () => {
    const report = await repository.getReport({
      businessDate: '2026-10-21',
      collectorId: null,
      status: 'all',
    });

    const overdueRows = report.rows.filter((row) => row.status === 'overdue');

    expect(overdueRows.length).toBeGreaterThan(0);
    for (const row of overdueRows) {
      expect(row.oldestUnpaidDueDate).not.toBeNull();
      expect(row.overdueDays).toBe(
        calendarDaysBetween(row.oldestUnpaidDueDate!, report.filters.businessDate),
      );
    }
  });

  it('does not mark an installment due on the cutoff date as overdue', async () => {
    const report = await repository.getReport({
      businessDate: '2026-10-21',
      collectorId: null,
      status: 'all',
    });
    const newLoan = report.rows.find((row) => row.loanId === 'loan-6');

    expect(newLoan).toMatchObject({
      oldestUnpaidDueDate: null,
      overdueDays: 0,
      status: 'on_track',
    });
  });

  it('filters by collector and status and recalculates the summary', async () => {
    const report = await repository.getReport({
      businessDate: '2026-10-21',
      collectorId: 'collector-1',
      status: 'overdue',
    });

    expect(report.rows.length).toBeGreaterThan(0);
    expect(report.rows.every((row) => row.collectorId === 'collector-1')).toBe(true);
    expect(report.rows.every((row) => row.status === 'overdue')).toBe(true);
    expect(report.summary.overdueClients).toBe(report.rows.length);
    expect(report.summary.scheduledAmount).toBe(
      report.rows.reduce((total, row) => total + row.scheduledOnDate, 0),
    );
  });
});

describe('calendarDaysBetween', () => {
  it('counts Sundays and every other calendar day', () => {
    expect(calendarDaysBetween('2026-10-17', '2026-10-19')).toBe(2);
  });

  it('never returns a negative value', () => {
    expect(calendarDaysBetween('2026-10-22', '2026-10-21')).toBe(0);
  });
});
