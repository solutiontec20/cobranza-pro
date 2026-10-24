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

  it('provides independent draft, submitted and validated closure fixtures', async () => {
    const closures = await repository.listClosures('2026-10-21');

    expect(closures.map((closure) => closure.status)).toEqual([
      'submitted',
      'validated',
      'draft',
    ]);
    expect(closures[0]?.methodSummary).toEqual({ cash: 12, yape: 20, total: 32 });
    expect(closures[0]?.movements).toHaveLength(2);
    expect(closures[2]).toMatchObject({ registeredAmount: 25, expectedAmount: 20 });
    expect(closures[2]?.movements.at(-1)).toMatchObject({
      direction: 'outflow',
      type: 'loan_disbursement',
      amount: 5,
    });
  });

  it('submits a draft closure and reconciles delivery against the net expected amount', async () => {
    const closures = await repository.listClosures('2026-10-21');
    const draft = closures.find((closure) => closure.status === 'draft')!;

    const submitted = await repository.submitClosure({
      closureId: draft.id,
      deliveredAmount: 19,
      observation: '  Falta revisar un sol.  ',
    });

    expect(submitted).toMatchObject({
      status: 'submitted',
      deliveredAmount: 19,
      difference: -1,
      observation: 'Falta revisar un sol.',
    });
  });

  it('allows resubmitting a submitted closure but never a validated closure', async () => {
    const closures = await repository.listClosures('2026-10-21');
    const submitted = closures.find((closure) => closure.status === 'submitted')!;
    const validated = closures.find((closure) => closure.status === 'validated')!;

    await expect(
      repository.submitClosure({
        closureId: submitted.id,
        deliveredAmount: submitted.expectedAmount + 2,
        observation: null,
      }),
    ).resolves.toMatchObject({ status: 'submitted', difference: 2 });

    await expect(
      repository.submitClosure({
        closureId: validated.id,
        deliveredAmount: validated.expectedAmount,
        observation: null,
      }),
    ).rejects.toThrow('Un cierre validado no puede volver a enviarse.');
  });

  it('only validates a closure previously submitted by a collector', async () => {
    const closures = await repository.listClosures('2026-10-21');
    const submitted = closures.find((closure) => closure.status === 'submitted')!;
    const draft = closures.find((closure) => closure.status === 'draft')!;

    await expect(
      repository.validateClosure({
        closureId: draft.id,
        validatedBy: 'Administrador Demo',
        observation: null,
      }),
    ).rejects.toThrow('Solo se puede validar un cierre enviado por el cobrador.');

    const validated = await repository.validateClosure({
      closureId: submitted.id,
      validatedBy: 'Administrador Demo',
      observation: 'Efectivo conforme.',
    });
    expect(validated).toMatchObject({
      status: 'validated',
      validatedBy: 'Administrador Demo',
      observation: 'Efectivo conforme.',
    });
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
