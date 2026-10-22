import { Injectable } from '@angular/core';
import {
  DailyControlCollectorOption,
  DailyControlFilters,
  DailyControlReport,
  DailyControlRow,
  DailyControlSummary,
} from '../models/daily-control.model';
import { DailyControlRepository } from '../repositories/daily-control.repository';

interface FixtureInstallment {
  dueDate: string;
  amount: number;
}

interface FixturePayment {
  businessDate: string;
  amount: number;
  status?: 'posted' | 'voided';
}

interface FixtureLoan {
  id: string;
  clientId: string;
  clientDni: string;
  clientName: string;
  collectorId: string;
  principalAmount: number;
  totalAmount: number;
  startedOn: string;
  installments: FixtureInstallment[];
  payments: FixturePayment[];
}

const DAY_IN_MS = 86_400_000;

const COLLECTORS: DailyControlCollectorOption[] = [
  { id: 'collector-1', fullName: 'Pedro Castillo' },
  { id: 'collector-2', fullName: 'Luis Quispe' },
  { id: 'collector-3', fullName: 'Ana Torres' },
];

const FIXTURE_LOANS: FixtureLoan[] = [
  fixtureLoan('loan-1', 'client-1', '45678901', 'Juan Pérez', 'collector-1', 300, 360, '2026-09-25', 30, 12, [
    payment('2026-09-25', 60), payment('2026-10-03', 48), payment('2026-10-10', 36),
    payment('2026-10-15', 24), payment('2026-10-21', 12),
  ]),
  fixtureLoan('loan-2', 'client-2', '46789012', 'María López', 'collector-1', 400, 480, '2026-09-28', 24, 20, [
    payment('2026-09-28', 200), payment('2026-10-08', 100), payment('2026-10-17', 60),
    payment('2026-10-21', 20),
  ]),
  fixtureLoan('loan-3', 'client-3', '47890123', 'Roberto Gómez', 'collector-1', 200, 240, '2026-09-20', 24, 10, [
    payment('2026-09-20', 100), payment('2026-10-02', 80), payment('2026-10-18', 60),
  ]),
  fixtureLoan('loan-4', 'client-4', '48901234', 'Carlos Torres', 'collector-2', 500, 600, '2026-10-10', 30, 20, [
    payment('2026-10-10', 100), payment('2026-10-16', 80), payment('2026-10-21', 20),
  ]),
  fixtureLoan('loan-5', 'client-5', '49012345', 'Rosa Flores', 'collector-2', 250, 300, '2026-10-05', 20, 15, [
    payment('2026-10-05', 60), payment('2026-10-12', 45), payment('2026-10-20', 15),
  ]),
  fixtureLoan('loan-6', 'client-6', '40123456', 'Elena Morales', 'collector-2', 350, 420, '2026-10-20', 28, 15, [
    payment('2026-10-21', 30),
  ]),
  fixtureLoan('loan-7', 'client-7', '41234567', 'Fernando Silva', 'collector-3', 275, 330, '2026-10-01', 22, 15, [
    payment('2026-10-01', 75), payment('2026-10-09', 60), payment('2026-10-21', 15),
  ]),
  fixtureLoan('loan-8', 'client-8', '42345678', 'Lucía Díaz', 'collector-3', 210, 250, '2026-10-15', 25, 10, [
    payment('2026-10-15', 50), payment('2026-10-21', 10),
  ]),
];

@Injectable()
export class InMemoryDailyControlRepository implements DailyControlRepository {
  async listCollectors(): Promise<DailyControlCollectorOption[]> {
    return COLLECTORS.map((collector) => ({ ...collector }));
  }

  async getReport(filters: DailyControlFilters): Promise<DailyControlReport> {
    const rows = FIXTURE_LOANS
      .map((loan) => this.toReportRow(loan, filters.businessDate))
      .filter((row) => filters.collectorId === null || row.collectorId === filters.collectorId)
      .filter((row) => filters.status === 'all' || row.status === filters.status)
      .sort((left, right) => {
        if (left.status === 'overdue' && right.status !== 'overdue') return -1;
        if (left.status !== 'overdue' && right.status === 'overdue') return 1;
        return right.overdueDays - left.overdueDays || left.clientName.localeCompare(right.clientName, 'es-PE');
      });

    return {
      filters: { ...filters },
      rows,
      summary: summarize(rows),
      generatedAt: new Date().toISOString(),
    };
  }

  private toReportRow(loan: FixtureLoan, businessDate: string): DailyControlRow {
    const collectorName = COLLECTORS.find((collector) => collector.id === loan.collectorId)?.fullName ?? 'Sin asignar';
    const postedPayments = loan.payments.filter(
      (paymentItem) => paymentItem.status !== 'voided' && paymentItem.businessDate <= businessDate,
    );
    const paidToDate = Math.min(
      loan.totalAmount,
      postedPayments.reduce((total, paymentItem) => total + paymentItem.amount, 0),
    );
    const outstandingByInstallment = allocateOldestFirst(loan.installments, paidToDate);
    const oldestUnpaid = outstandingByInstallment.find(
      (installment) => installment.dueDate < businessDate && installment.outstandingAmount > 0,
    );
    const balanceAsOf = roundMoney(Math.max(0, loan.totalAmount - paidToDate));
    const overdueDays = oldestUnpaid ? calendarDaysBetween(oldestUnpaid.dueDate, businessDate) : 0;

    return {
      loanId: loan.id,
      clientId: loan.clientId,
      clientDni: loan.clientDni,
      clientName: loan.clientName,
      collectorId: loan.collectorId,
      collectorName,
      principalAmount: loan.principalAmount,
      totalAmount: loan.totalAmount,
      startedOn: loan.startedOn,
      endDate: loan.installments.at(-1)?.dueDate ?? loan.startedOn,
      installmentAmount: loan.installments[0]?.amount ?? 0,
      scheduledOnDate: roundMoney(
        loan.installments
          .filter((installment) => installment.dueDate === businessDate)
          .reduce((total, installment) => total + installment.amount, 0),
      ),
      collectedOnDate: roundMoney(
        loan.payments
          .filter(
            (paymentItem) =>
              paymentItem.status !== 'voided' && paymentItem.businessDate === businessDate,
          )
          .reduce((total, paymentItem) => total + paymentItem.amount, 0),
      ),
      paidToDate: roundMoney(paidToDate),
      balanceAsOf,
      oldestUnpaidDueDate: oldestUnpaid?.dueDate ?? null,
      overdueDays,
      status: balanceAsOf === 0 ? 'paid' : overdueDays > 0 ? 'overdue' : 'on_track',
    };
  }
}

function fixtureLoan(
  id: string,
  clientId: string,
  clientDni: string,
  clientName: string,
  collectorId: string,
  principalAmount: number,
  totalAmount: number,
  startedOn: string,
  installmentCount: number,
  installmentAmount: number,
  payments: FixturePayment[],
): FixtureLoan {
  return {
    id,
    clientId,
    clientDni,
    clientName,
    collectorId,
    principalAmount,
    totalAmount,
    startedOn,
    installments: buildDailySchedule(startedOn, installmentCount, installmentAmount, totalAmount),
    payments,
  };
}

function payment(businessDate: string, amount: number): FixturePayment {
  return { businessDate, amount, status: 'posted' };
}

function buildDailySchedule(
  startedOn: string,
  installmentCount: number,
  regularAmount: number,
  totalAmount: number,
): FixtureInstallment[] {
  const installments: FixtureInstallment[] = [];
  let cursor = parseIsoDate(startedOn);

  while (installments.length < installmentCount) {
    if (cursor.getUTCDay() !== 0) {
      const accumulated = installments.length * regularAmount;
      const isLast = installments.length === installmentCount - 1;
      installments.push({
        dueDate: toIsoDate(cursor),
        amount: isLast ? roundMoney(totalAmount - accumulated) : regularAmount,
      });
    }
    cursor = new Date(cursor.getTime() + DAY_IN_MS);
  }

  return installments;
}

function allocateOldestFirst(installments: FixtureInstallment[], paidAmount: number) {
  let remainingPayment = paidAmount;
  return installments.map((installment) => {
    const applied = Math.min(installment.amount, remainingPayment);
    remainingPayment = roundMoney(remainingPayment - applied);
    return {
      ...installment,
      outstandingAmount: roundMoney(installment.amount - applied),
    };
  });
}

export function calendarDaysBetween(fromDate: string, toDate: string): number {
  return Math.max(0, Math.floor((parseIsoDate(toDate).getTime() - parseIsoDate(fromDate).getTime()) / DAY_IN_MS));
}

function summarize(rows: DailyControlRow[]): DailyControlSummary {
  const scheduledAmount = roundMoney(rows.reduce((total, row) => total + row.scheduledOnDate, 0));
  const collectedAmount = roundMoney(rows.reduce((total, row) => total + row.collectedOnDate, 0));
  return {
    scheduledAmount,
    collectedAmount,
    operationalDifference: roundMoney(scheduledAmount - collectedAmount),
    attendedClients: rows.filter((row) => row.collectedOnDate > 0).length,
    overdueClients: rows.filter((row) => row.status === 'overdue').length,
  };
}

function parseIsoDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
