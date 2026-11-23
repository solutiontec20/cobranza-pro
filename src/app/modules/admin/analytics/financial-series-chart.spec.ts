import { TestBed } from '@angular/core/testing';
import {
  AnalyticsCollectorEntry,
  AnalyticsExpenseCategoryEntry,
  AnalyticsFinancialPoint,
} from '../../../core/models/analytics.model';
import { CollectorsChart } from './collectors-chart';
import { ExpenseCategoriesChart } from './expense-categories-chart';
import { FinancialSeriesChart } from './financial-series-chart';

vi.mock('chart.js/auto', () => ({
  default: class MockChart {
    data: { labels: unknown[]; datasets: Array<{ data: unknown[]; backgroundColor?: unknown }> };
    update = vi.fn();
    destroy = vi.fn();

    constructor(
      _canvas: HTMLCanvasElement,
      config: {
        data: {
          labels: unknown[];
          datasets: Array<{ data: unknown[]; backgroundColor?: unknown }>;
        };
      },
    ) {
      this.data = config.data;
    }
  },
}));

const points: AnalyticsFinancialPoint[] = [
  {
    bucketStart: '2026-11-01',
    bucketEnd: '2026-11-01',
    collectedAmount: 80,
    interestCollected: 20,
    loanDisbursements: 50,
    operatingExpenses: 5,
    netProfit: 15,
    paymentsCount: 2,
  },
];

async function renderSeries(kind: 'profit' | 'cashflow', bucket: 'day' | 'month') {
  await TestBed.configureTestingModule({ imports: [FinancialSeriesChart] }).compileComponents();
  const fixture = TestBed.createComponent(FinancialSeriesChart);
  fixture.componentRef.setInput('kind', kind);
  fixture.componentRef.setInput('bucket', bucket);
  fixture.componentRef.setInput('points', points);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture;
}

describe('FinancialSeriesChart', () => {
  it('renders a chart title, a clear accessible description, and PEN values', async () => {
    const fixture = await renderSeries('profit', 'day');

    expect(fixture.nativeElement.querySelector('h3')?.textContent).toContain(
      'Evolución financiera',
    );
    expect(fixture.nativeElement.querySelector('canvas')?.getAttribute('aria-label')).toContain(
      'Interés cobrado',
    );
    expect(fixture.nativeElement.querySelector('table caption')?.textContent).toContain(
      'soles peruanos',
    );
    expect(fixture.nativeElement.querySelector('tbody')?.textContent).toContain('20.00');
  });

  it('labels every table row with the inclusive date of its bucket', async () => {
    const fixture = await renderSeries('profit', 'day');

    expect(fixture.nativeElement.querySelector('tbody th')?.textContent).toContain('01/11/2026');
  });

  it('compares loan disbursements against collections', async () => {
    const fixture = await renderSeries('cashflow', 'month');

    expect(fixture.nativeElement.querySelector('h3')?.textContent).toContain(
      'Desembolsos frente a cobros',
    );
    const cells = Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('tbody td')).map(
      (cell) => cell.textContent,
    );
    expect(cells[0]).toContain('50.00');
    expect(cells[1]).toContain('80.00');
  });
});

describe('CollectorsChart', () => {
  it('renders an accessible title and one data point per collector', async () => {
    const entries: AnalyticsCollectorEntry[] = [
      {
        collectorId: 'c1',
        name: 'Ana Torres',
        dni: '87654321',
        collectedAmount: 80,
        interestCollected: 13,
        paymentsCount: 3,
        clientsAttended: 2,
        loanDisbursements: 0,
        operatingExpenses: 0,
        netProfit: 13,
      },
    ];
    await TestBed.configureTestingModule({ imports: [CollectorsChart] }).compileComponents();
    const fixture = TestBed.createComponent(CollectorsChart);
    fixture.componentRef.setInput('entries', entries);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('h3')?.textContent).toContain(
      'Cobranza por cobrador',
    );
    expect(fixture.nativeElement.querySelector('canvas')?.getAttribute('aria-label')).toContain(
      'soles peruanos',
    );
  });
});

describe('ExpenseCategoriesChart', () => {
  it('renders an accessible title explaining that allowances are not expenses', async () => {
    const entries: AnalyticsExpenseCategoryEntry[] = [
      { category: 'fuel', expenseCount: 1, spentAmount: 5 },
    ];
    await TestBed.configureTestingModule({ imports: [ExpenseCategoriesChart] }).compileComponents();
    const fixture = TestBed.createComponent(ExpenseCategoriesChart);
    fixture.componentRef.setInput('entries', entries);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('h3')?.textContent).toContain(
      'Gastos por categoría',
    );
    expect(fixture.nativeElement.textContent).toContain('viático entregado no es gasto');
  });
});
