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

@Component({
  selector: 'app-recovery-chart',
  template: `
    <div class="relative mt-3 flex h-[250px] justify-center">
      <canvas #donutChart></canvas>
    </div>
  `,
})
export class RecoveryChart {
  readonly totalCobrado = input.required<number>();
  readonly saldoPendiente = input.required<number>();

  private readonly destroyRef = inject(DestroyRef);
  private readonly donutChartRef =
    viewChild.required<ElementRef<HTMLCanvasElement>>('donutChart');
  private chartInstance: Chart | null = null;

  constructor() {
    afterRenderEffect(() => {
      const cobrado = this.totalCobrado();
      const pendiente = this.saldoPendiente();

      if (!this.chartInstance) {
        this.chartInstance = this.createChart(cobrado, pendiente);
        return;
      }

      this.chartInstance.data.datasets[0].data = [cobrado, pendiente];
      this.chartInstance.update();
    });

    this.destroyRef.onDestroy(() => {
      this.chartInstance?.destroy();
      this.chartInstance = null;
    });
  }

  private createChart(cobrado: number, pendiente: number): Chart {
    return new Chart(this.donutChartRef().nativeElement, {
      type: 'doughnut',
      data: {
        labels: ['Cobrado', 'Pendiente'],
        datasets: [
          {
            data: [cobrado, pendiente],
            backgroundColor: ['#2563EB', '#DCE5F0'],
            hoverBackgroundColor: ['#1D4ED8', '#CBD5E1'],
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '70%',
        plugins: {
          legend: { position: 'bottom' },
        },
      },
    });
  }
}
