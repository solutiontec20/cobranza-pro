import { TestBed } from '@angular/core/testing';
import { DashboardFinancialPoint } from '../../../core/models/admin-dashboard.model';
import { FinancialSeriesChart } from './financial-series-chart';

vi.mock('chart.js/auto', () => ({
  default: class MockChart {
    data: { labels: unknown[]; datasets: unknown[] };
    update = vi.fn();
    destroy = vi.fn();

    constructor(
      _canvas: HTMLCanvasElement,
      config: { data: { labels: unknown[]; datasets: unknown[] } },
    ) {
      this.data = config.data;
    }
  },
}));

const points: DashboardFinancialPoint[] = [
  {
    bucketStart: '2026-11-01',
    bucketEnd: '2026-11-01',
    collectedAmount: 80,
    interestCollected: 20,
    loanDisbursements: 50,
    operatingExpenses: 5,
    netProfit: 15,
  },
];

describe('FinancialSeriesChart', () => {
  it('renders a chart title, a clear accessible description, and PEN values', async () => {
    await TestBed.configureTestingModule({ imports: [FinancialSeriesChart] }).compileComponents();
    const fixture = TestBed.createComponent(FinancialSeriesChart);
    fixture.componentRef.setInput('kind', 'profit');
    fixture.componentRef.setInput('granularity', 'daily');
    fixture.componentRef.setInput('points', points);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('h3')?.textContent).toContain('Utilidad');
    expect(fixture.nativeElement.querySelector('canvas')?.getAttribute('aria-label')).toContain(
      'Interés cobrado',
    );
    expect(fixture.nativeElement.querySelector('table caption')?.textContent).toContain(
      'soles peruanos',
    );
    expect(fixture.nativeElement.querySelector('tbody')?.textContent).toContain('20.00');
  });

  it('names loan disbursements and approved expenses separately for cash outflows', async () => {
    await TestBed.configureTestingModule({ imports: [FinancialSeriesChart] }).compileComponents();
    const fixture = TestBed.createComponent(FinancialSeriesChart);
    fixture.componentRef.setInput('kind', 'outflows');
    fixture.componentRef.setInput('granularity', 'monthly');
    fixture.componentRef.setInput('points', points);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain('Desembolsos de préstamos');
    expect(fixture.nativeElement.textContent).toContain('Gastos y viáticos aprobados');
  });
});
