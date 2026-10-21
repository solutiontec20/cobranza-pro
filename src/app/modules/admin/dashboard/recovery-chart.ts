import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, effect, input } from '@angular/core';
import Chart from 'chart.js/auto';

@Component({
  selector: 'app-recovery-chart',
  template: `
    <div class="relative mt-3 flex h-[250px] justify-center">
      <canvas #donutChart></canvas>
    </div>
  `,
})
export class RecoveryChart implements AfterViewInit, OnDestroy {
  readonly totalCobrado = input.required<number>();
  readonly saldoPendiente = input.required<number>();

  @ViewChild('donutChart') private donutChartRef!: ElementRef<HTMLCanvasElement>;
  private chartInstance: Chart | null = null;

  constructor() {
    // Mantiene el gráfico sincronizado si los KPIs cambian mientras está montado.
    effect(() => {
      const cobrado = this.totalCobrado();
      const pendiente = this.saldoPendiente();
      if (this.chartInstance) {
        this.chartInstance.data.datasets[0].data = [cobrado, pendiente];
        this.chartInstance.update();
      }
    });
  }

  ngAfterViewInit(): void {
    this.chartInstance = new Chart(this.donutChartRef.nativeElement, {
      type: 'doughnut',
      data: {
        labels: ['Cobrado', 'Pendiente'],
        datasets: [
          {
            data: [this.totalCobrado(), this.saldoPendiente()],
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

  ngOnDestroy(): void {
    this.chartInstance?.destroy();
  }
}
