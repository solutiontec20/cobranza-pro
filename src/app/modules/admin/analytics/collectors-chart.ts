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
import { AnalyticsCollectorEntry } from '../../../core/models/analytics.model';
import { formatFinancialAmount } from './analytics-calculations';

@Component({
  selector: 'app-collectors-chart',
  template: `
    <h3 class="m-0 text-base font-semibold text-surface-900 dark:text-surface-0">
      Cobranza por cobrador
    </h3>
    <p class="mb-2 mt-1 text-xs text-surface-500 dark:text-surface-400">
      Cobranza recibida e interés cobrado por cada cobrador en el período.
    </p>
    <div
      class="relative h-[260px] w-full sm:h-[300px]"
      role="group"
      aria-label="Cobranza por cobrador"
    >
      <canvas
        #chartCanvas
        role="img"
        aria-label="Cobranza por cobrador. Series: cobranza recibida, interés cobrado. Valores en soles peruanos; el detalle numérico está en la tabla de cobradores."
      ></canvas>
    </div>
  `,
  styles: [':host { display: block; min-width: 0; }'],
})
export class CollectorsChart {
  readonly entries = input.required<AnalyticsCollectorEntry[]>();

  private readonly destroyRef = inject(DestroyRef);
  private readonly chartCanvas = viewChild.required<ElementRef<HTMLCanvasElement>>('chartCanvas');
  private chart: Chart<'bar', number[], string> | null = null;

  constructor() {
    afterRenderEffect(() => {
      const entries = this.entries();
      const labels = entries.map((entry) => entry.name);
      const datasets = [
        {
          label: 'Cobranza recibida',
          data: entries.map((entry) => entry.collectedAmount),
          backgroundColor: '#2563eb',
          borderRadius: 4,
        },
        {
          label: 'Interés cobrado',
          data: entries.map((entry) => entry.interestCollected),
          backgroundColor: '#059669',
          borderRadius: 4,
        },
      ];
      const textColor = getComputedStyle(this.chartCanvas().nativeElement).color || '#64748b';

      if (!this.chart) {
        this.chart = new Chart(this.chartCanvas().nativeElement, {
          type: 'bar',
          data: { labels, datasets },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                position: 'bottom',
                labels: { color: textColor, usePointStyle: true, boxWidth: 8 },
              },
              tooltip: {
                callbacks: {
                  label: (context) =>
                    `${context.dataset.label}: ${formatFinancialAmount(context.parsed.y ?? 0)}`,
                },
              },
            },
            scales: {
              x: { grid: { display: false }, ticks: { color: textColor, maxRotation: 0 } },
              y: {
                beginAtZero: true,
                grid: { color: 'rgba(148, 163, 184, 0.2)' },
                ticks: {
                  color: textColor,
                  callback: (value) =>
                    new Intl.NumberFormat('es-PE', {
                      style: 'currency',
                      currency: 'PEN',
                      notation: 'compact',
                      maximumFractionDigits: 1,
                    }).format(Number(value)),
                },
              },
            },
          },
        });
      } else {
        this.chart.data.labels = labels;
        this.chart.data.datasets = datasets;
        this.chart.update();
      }
    });

    this.destroyRef.onDestroy(() => {
      this.chart?.destroy();
      this.chart = null;
    });
  }
}
