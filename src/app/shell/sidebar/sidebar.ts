import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { LayoutService } from '../../core/services/layout.service';
import { AuthService } from '../../modules/auth/auth.service';

@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive],
  template: `
    <div class="flex flex-col h-full bg-surface-0 dark:bg-surface-900 px-4 py-6 overflow-hidden">
      <!-- Logo -->
      <div class="flex items-center gap-3 px-2 mb-10 whitespace-nowrap">
        <div class="w-10 h-10 bg-primary-600 dark:bg-primary-500 rounded-xl flex items-center justify-center shadow-md flex-shrink-0">
          <i class="pi pi-wallet text-xl text-white"></i>
        </div>
        <span class="text-xl font-bold text-surface-900 dark:text-surface-0 tracking-tight" [class.hidden]="layoutService.sidebarCollapsed()">CobranzaPro</span>
      </div>

      <!-- Navigation -->
      <div class="flex-1 overflow-y-auto pr-2 -mr-2">
        <div class="space-y-1">
          @if (authService.currentUser()?.role === 'COBRADOR') {
            <p class="px-2 text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-2 mt-4 truncate" [class.hidden]="layoutService.sidebarCollapsed()">Cobrador</p>
            
            <a routerLink="/cobrador" routerLinkActive="bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 font-bold" [routerLinkActiveOptions]="{exact: true}" class="flex items-center gap-3 px-3 py-3 rounded-lg text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 font-medium transition-colors group focus-visible:ring-2 focus-visible:ring-primary-500">
              <i class="pi pi-home text-lg" aria-hidden="true"></i>
              <span [class.hidden]="layoutService.sidebarCollapsed()">Cobranza de hoy</span>
            </a>
            
            <a routerLink="/cobrador/clientes" routerLinkActive="bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 font-bold" class="flex items-center gap-3 px-3 py-3 rounded-lg text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 font-medium transition-all group">
              <i class="pi pi-users text-lg text-surface-400 group-hover:text-surface-700 dark:group-hover:text-surface-100 transition-colors"></i>
              <span [class.hidden]="layoutService.sidebarCollapsed()">Mis Clientes</span>
            </a>

            <a routerLink="/perfil" routerLinkActive="bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 font-bold" class="flex items-center gap-3 px-3 py-3 rounded-lg text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 font-medium transition-all group">
              <i class="pi pi-user text-lg text-surface-400 group-hover:text-surface-700 dark:group-hover:text-surface-100 transition-colors"></i>
              <span [class.hidden]="layoutService.sidebarCollapsed()">Perfil</span>
            </a>
          } @else if (authService.currentUser()?.role === 'ADMINISTRADOR') {
            <p class="px-2 text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-2 mt-4 truncate" [class.hidden]="layoutService.sidebarCollapsed()">Administración</p>
            
            <a routerLink="/admin/dashboard" routerLinkActive="bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 font-bold" class="flex items-center gap-3 px-3 py-3 rounded-lg text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 font-medium transition-all group">
              <i class="pi pi-chart-bar text-lg text-surface-400 group-hover:text-surface-700 dark:group-hover:text-surface-100 transition-colors"></i>
              <span [class.hidden]="layoutService.sidebarCollapsed()">Dashboard</span>
            </a>
            <a routerLink="/admin/clientes" routerLinkActive="bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 font-bold" class="flex items-center gap-3 px-3 py-3 rounded-lg text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 font-medium transition-all group">
              <i class="pi pi-users text-lg text-surface-400 group-hover:text-surface-700 dark:group-hover:text-surface-100 transition-colors"></i>
              <span [class.hidden]="layoutService.sidebarCollapsed()">Clientes</span>
            </a>
            <a routerLink="/admin/prestamos" routerLinkActive="bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 font-bold" class="flex items-center gap-3 px-3 py-3 rounded-lg text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 font-medium transition-all group">
              <i class="pi pi-wallet text-lg text-surface-400 group-hover:text-surface-700 dark:group-hover:text-surface-100 transition-colors"></i>
              <span [class.hidden]="layoutService.sidebarCollapsed()">Préstamos</span>
            </a>
            <a routerLink="/admin/cobradores" routerLinkActive="bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 font-bold" class="flex items-center gap-3 px-3 py-3 rounded-lg text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 font-medium transition-all group">
              <i class="pi pi-id-card text-lg text-surface-400 group-hover:text-surface-700 dark:group-hover:text-surface-100 transition-colors"></i>
              <span [class.hidden]="layoutService.sidebarCollapsed()">Cobradores</span>
            </a>
            <a routerLink="/admin/control-diario" routerLinkActive="bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 font-bold" class="flex items-center gap-3 px-3 py-3 rounded-lg text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 font-medium transition-all group">
              <i class="pi pi-file-excel text-lg text-surface-400 group-hover:text-surface-700 dark:group-hover:text-surface-100 transition-colors"></i>
              <span [class.hidden]="layoutService.sidebarCollapsed()">Control Diario</span>
            </a>
            <a routerLink="/admin/auditoria" routerLinkActive="bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 font-bold" class="flex items-center gap-3 px-3 py-3 rounded-lg text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 font-medium transition-all group">
              <i class="pi pi-shield text-lg text-surface-400 group-hover:text-surface-700 dark:group-hover:text-surface-100 transition-colors"></i>
              <span [class.hidden]="layoutService.sidebarCollapsed()">Auditoría</span>
            </a>
          }
        </div>
      </div>

      <!-- User Profile Bottom -->
      <div class="pt-4 mt-auto border-t border-surface-200 dark:border-surface-800">
        <div class="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 cursor-pointer transition-colors overflow-hidden">
          <div class="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0 text-white font-bold shadow-sm">
            {{ authService.currentUser()?.fullName?.charAt(0) || 'U' }}
          </div>
          <div class="flex-1 min-w-0" [class.hidden]="layoutService.sidebarCollapsed()">
            <p class="text-sm font-bold text-surface-900 dark:text-surface-0 truncate m-0">{{ authService.currentUser()?.fullName || 'Usuario' }}</p>
            <p class="text-xs text-surface-500 truncate m-0">{{ authService.currentUser()?.role || '' }}</p>
          </div>
        </div>
        <!-- Logout Button -->
        <button 
          (click)="authService.logout()"
          class="w-full mt-2 flex items-center gap-3 px-3 py-2 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 font-medium transition-colors"
          [class.justify-center]="layoutService.sidebarCollapsed()">
          <i class="pi pi-sign-out text-lg"></i>
          <span [class.hidden]="layoutService.sidebarCollapsed()">Cerrar sesión</span>
        </button>
      </div>
    </div>
  `
})
export class Sidebar {
  layoutService = inject(LayoutService);
  authService = inject(AuthService);
}
