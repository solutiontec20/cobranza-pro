import { Component, computed, inject, ViewChild, ElementRef, AfterViewInit, OnDestroy, effect } from '@angular/core';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { ProgressBarModule } from 'primeng/progressbar';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { AppStoreService, SYSTEM_DATE } from '../../../core/services/app-store.service';
import { AuthService } from '../../auth/auth.service';
import Chart from 'chart.js/auto';

@Component({
  selector: 'app-dashboard',
  imports: [CardModule, ButtonModule, TableModule, ProgressBarModule, CurrencyPipe, DatePipe],
  templateUrl: './dashboard.html'
})
export default class Dashboard implements AfterViewInit, OnDestroy {
  appStore = inject(AppStoreService);
  authService = inject(AuthService);
  
  today = SYSTEM_DATE;

  @ViewChild('donutChart') donutChartRef!: ElementRef<HTMLCanvasElement>;
  private chartInstance: Chart | null = null;

  readonly kpis = computed(() => {
    const loans = this.appStore.loans();
    const activeLoans = loans.filter(l => l.status === 'ACTIVE');
    const paidLoans = loans.filter(l => l.status === 'PAID');
    const clients = this.appStore.clients().filter(c => c.active);
    const collectors = this.appStore.profiles().filter(p => p.role === 'COBRADOR' && p.active);
    const payments = this.appStore.payments();

    const capitalPrestado = activeLoans.reduce((sum, l) => sum + l.principal, 0);
    const totalEsperado = activeLoans.reduce((sum, l) => sum + l.totalAmount, 0);
    const totalCobrado = activeLoans.reduce((sum, l) => {
        const loanPayments = payments.filter(p => p.loanId === l.id);
        return sum + loanPayments.reduce((ps, p) => ps + p.amount, 0);
    }, 0);
    const saldoPendiente = activeLoans.reduce((sum, l) => sum + l.balance, 0);
    
    // Morosidad
    let morososCount = 0;
    for (const client of clients) {
        const risk = this.appStore.getClientRiskStatus(client);
        if (risk.isMoroso) morososCount++;
    }

    return {
      capitalPrestado,
      totalEsperado,
      totalCobrado,
      saldoPendiente,
      morosidad: morososCount,
      totalClientes: clients.length,
      prestamosPagados: paidLoans.length,
      cobradores: collectors.length
    };
  });

  readonly riskDistribution = computed(() => {
    const clients = this.appStore.clients().filter(c => c.active);
    let green = 0, yellow = 0, orange = 0, red = 0;
    
    for (const client of clients) {
        const risk = this.appStore.getClientRiskStatus(client);
        if (risk.level === 'green' && !risk.isPaid) green++;
        else if (risk.level === 'yellow') yellow++;
        else if (risk.level === 'orange') orange++;
        else if (risk.level === 'red') red++;
    }
    
    const total = green + yellow + orange + red || 1; // avoid division by zero
    
    return {
      green: { count: green, percent: Math.round((green / total) * 100) },
      yellow: { count: yellow, percent: Math.round((yellow / total) * 100) },
      orange: { count: orange, percent: Math.round((orange / total) * 100) },
      red: { count: red, percent: Math.round((red / total) * 100) }
    };
  });

  readonly collectorPerformance = computed(() => {
    const collectors = this.appStore.profiles().filter(p => p.role === 'COBRADOR');
    return collectors.map(c => {
      const cClients = this.appStore.clients().filter(cl => cl.collectorId === c.id);
      
      let expectedToday = 0;
      for (const cl of cClients) {
        const activeLoan = this.appStore.loans().find(l => l.clientId === cl.id && l.status === 'ACTIVE');
        if (activeLoan) {
          const inst = this.appStore.getClientTodayInstallment(activeLoan.id);
          if (inst) expectedToday += inst.expectedAmount;
        }
      }
      
      const collectedToday = this.appStore.payments()
        .filter(p => p.collectorId === c.id && p.date === this.today)
        .reduce((sum, p) => sum + p.amount, 0);
        
      const pendingToday = Math.max(0, expectedToday - collectedToday);

      let delayedCount = 0;
      for (const cl of cClients) {
          const risk = this.appStore.getClientRiskStatus(cl);
          if (risk.days > 0) delayedCount++;
      }
      
      return {
        id: c.id,
        name: c.fullName,
        dni: c.dni,
        clientsCount: cClients.length,
        expectedToday,
        collectedToday,
        pendingToday,
        delayedCount
      };
    });
  });

  constructor() {
    // Reactively update chart when KPIs change
    effect(() => {
      const kpis = this.kpis();
      if (this.chartInstance) {
        this.chartInstance.data.datasets[0].data = [kpis.totalCobrado, kpis.saldoPendiente];
        this.chartInstance.update();
      }
    });
  }

  ngAfterViewInit() {
    if (this.donutChartRef?.nativeElement) {
      const kpis = this.kpis();
      this.chartInstance = new Chart(this.donutChartRef.nativeElement, {
        type: 'doughnut',
        data: {
          labels: ['Cobrado', 'Pendiente'],
          datasets: [{
            data: [kpis.totalCobrado, kpis.saldoPendiente],
            backgroundColor: ['#10B981', '#E2E8F0'],
            hoverBackgroundColor: ['#059669', '#CBD5E1']
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '70%',
          plugins: {
            legend: { position: 'bottom' }
          }
        }
      });
    }
  }

  ngOnDestroy() {
    if (this.chartInstance) {
      this.chartInstance.destroy();
    }
  }
}
