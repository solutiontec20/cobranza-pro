import { Component, computed, inject } from '@angular/core';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { ChartModule } from 'primeng/chart';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { AppStoreService, SYSTEM_DATE } from '../../../core/services/app-store.service';
import { AuthService } from '../../auth/auth.service';

@Component({
  selector: 'app-dashboard',
  imports: [CardModule, ButtonModule, TableModule, ChartModule, CurrencyPipe, DatePipe],
  templateUrl: './dashboard.html'
})
export default class Dashboard {
  appStore = inject(AppStoreService);
  authService = inject(AuthService);
  
  today = SYSTEM_DATE;

  readonly adminSummary = computed(() => {
    const loans = this.appStore.loans().filter(l => l.status === 'ACTIVE');
    const clients = this.appStore.clients().filter(c => c.active);
    const todayPayments = this.appStore.payments().filter(p => p.date === this.today);
    return {
      activeLoans: loans.length,
      activeClients: clients.length,
      totalBalance: loans.reduce((sum, l) => sum + l.balance, 0),
      collectedToday: todayPayments.reduce((sum, p) => sum + p.amount, 0),
    };
  });

  readonly chartData = computed(() => {
    const collectors = this.appStore.profiles().filter(p => p.role === 'COBRADOR');
    return {
      labels: collectors.map(c => c.fullName.split(' ')[0]),
      datasets: [{
        label: 'Recaudado hoy (S/)',
        backgroundColor: '#10B981',
        borderRadius: 4,
        data: collectors.map(c => 
          this.appStore.payments()
            .filter(p => p.collectorId === c.id && p.date === this.today)
            .reduce((sum, p) => sum + p.amount, 0)
        )
      }]
    };
  });

  chartOptions = {
    plugins: {
      legend: {
        display: false
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: function(value: any) {
            return 'S/ ' + value;
          }
        }
      }
    }
  };

  readonly recentLogs = computed(() => {
    return this.appStore.auditLogs().slice(0, 5);
  });
}
