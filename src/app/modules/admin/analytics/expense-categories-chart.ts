import {
  Component,
  DestroyRef,
  ElementRef,
  afterRenderEffect,
  inject,
  input,
  viewChild,
} from '@angular/core';
import Chart from 'chart.js/auto';
import { AnalyticsExpenseCategoryEntry } from '../../../core/models/analytics.model';
import { EXPENSE_CATEGORY_LABELS, formatFinancialAmount } from './analytics-calculations';

const COLORS = ['#2563eb', '#d97706', '#059669', '#7c3aed', '#dc2626', '#0891b2'];

@Component({
  selector: 'app-expense-categories-chart',
  template: `
    <h3 class="m-0 text-base font-semibold text-surface-900 dark:text-surface-0">
      Gastos por categoría
    </h3>
    <p class="mb-2 mt-1 text-xs text-surface-500 dark:text-surface-400">
      Solo gastos aprobados; el viático entregado no es gasto.
    </p>
    <div
      class="relative h-[260px] w-full sm:h-[300px]"
      role="group"
      aria-label="Gastos por categoría"
    >
      <canvas
        #chartCanvas
        role="img"
        aria-label="Gastos aprobados por categoría, en soles peruanos; el detalle numérico está en la tabla de categorías."
      ></canvas>
    </div>
  `,
  styles: [':host { display: block; min-width: 0; }'],
})
export class ExpenseCategoriesChart {
  readonly entries = input.required<AnalyticsExpenseCategoryEntry[]>();

  private readonly destroyRef = inject(DestroyRef);
  private readonly chartCanvas = viewChild.required<ElementRef<HTMLCanvasElement>>('chartCanvas');
  private chart: Chart<'doughnut', number[], string> | null = null;

  constructor() {
    afterRenderEffect(() => {
      const entries = this.entries();
      const labels = entries.map((entry) => EXPENSE_CATEGORY_LABELS[entry.category]);
      const data = entries.map((entry) => entry.spentAmount);
      const textColor = getComputedStyle(this.chartCanvas().nativeElement).color || '#64748b';

      if (!this.chart) {
        this.chart = new Chart(this.chartCanvas().nativeElement, {
          type: 'doughnut',
          data: {
            labels,
            datasets: [{ data, backgroundColor: COLORS.slice(0, Math.max(entries.length, 1)) }],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '60%',
            plugins: {
              legend: {
                position: 'bottom',
                labels: { color: textColor, usePointStyle: true, boxWidth: 8 },
              },
              tooltip: {
                callbacks: {
                  label: (context) =>
                    `${context.label}: ${formatFinancialAmount(Number(context.parsed))}`,
                },
              },
            },
          },
        });
      } else {
        this.chart.data.labels = labels;
        this.chart.data.datasets[0].data = data;
        this.chart.data.datasets[0].backgroundColor = COLORS.slice(0, Math.max(entries.length, 1));
        this.chart.update();
      }
    });

    this.destroyRef.onDestroy(() => {
      this.chart?.destroy();
      this.chart = null;
    });
  }
}
