import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Sidebar } from './sidebar/sidebar';
import { Topbar } from './topbar/topbar';
import { LayoutService } from '../core/services/layout.service';
import { AuthService } from '../modules/auth/auth.service';
import { ToastModule } from 'primeng/toast';

@Component({
  selector: 'app-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, Sidebar, Topbar, ToastModule],
  template: `
    <div class="min-h-screen bg-surface-50 dark:bg-surface-950 flex font-sans text-surface-900 dark:text-surface-0">
      <p-toast />
      <!-- Desktop Sidebar -->
      <app-sidebar 
        class="hidden md:flex flex-col border-r border-surface-200 dark:border-surface-800 bg-surface-0 dark:bg-surface-900 transition-all duration-300 ease-in-out"
        [class.w-72]="!layoutService.sidebarCollapsed()"
        [class.w-20]="layoutService.sidebarCollapsed()"
      />
      
      <!-- Main Content Area -->
      <div class="flex-1 flex flex-col min-w-0 h-screen overflow-hidden transition-all duration-300 ease-in-out">
        <app-topbar class="h-16 flex-shrink-0 border-b border-surface-200 dark:border-surface-800 bg-surface-0/80 dark:bg-surface-900/80 backdrop-blur-md z-10 sticky top-0" />
        
        <main id="main-content" class="flex-1 overflow-auto pb-20 md:pb-8">
          <router-outlet />
        </main>

        <!-- Mobile Bottom Nav -->
        <nav aria-label="Navegación principal" class="md:hidden fixed bottom-0 left-0 right-0 min-h-16 bg-surface-0 dark:bg-surface-900 border-t border-surface-200 dark:border-surface-800 flex items-center justify-around z-20 px-2 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
          @if (authService.currentUser()?.role === 'COBRADOR') {
            <a routerLink="/cobrador" routerLinkActive="text-primary-600 dark:text-primary-400" [routerLinkActiveOptions]="{ exact: true }" class="flex min-h-12 min-w-16 flex-col items-center justify-center gap-1 text-surface-500 hover:text-surface-900 focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-surface-400 dark:hover:text-surface-0 transition-colors">
              <i class="pi pi-home text-xl"></i>
              <span class="text-[11px] font-medium">Ruta</span>
            </a>
            <a routerLink="/cobrador/clientes" routerLinkActive="text-primary-600 dark:text-primary-400" class="flex min-h-12 min-w-16 flex-col items-center justify-center gap-1 text-surface-500 hover:text-surface-900 focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-surface-400 dark:hover:text-surface-0 transition-colors">
              <i class="pi pi-users text-xl"></i>
              <span class="text-[11px] font-medium">Clientes</span>
            </a>
            <button class="w-14 h-14 bg-green-500 hover:bg-green-600 rounded-full flex items-center justify-center text-white -mt-6 shadow-lg shadow-green-500/30 border-4 border-surface-0 dark:border-surface-900 text-2xl z-30 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-green-500/50 transition-all">
              <i class="pi pi-money-bill"></i>
            </button>
            <a routerLink="/perfil" routerLinkActive="text-primary-600 dark:text-primary-400" class="flex min-h-12 min-w-16 flex-col items-center justify-center gap-1 text-surface-500 hover:text-surface-900 focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-surface-400 dark:hover:text-surface-0 transition-colors">
              <i class="pi pi-user text-xl"></i>
              <span class="text-[11px] font-medium">Perfil</span>
            </a>
          } @else if (authService.currentUser()?.role === 'ADMINISTRADOR') {
            <a routerLink="/admin/dashboard" routerLinkActive="text-primary-600 dark:text-primary-400" class="flex min-h-12 flex-col items-center justify-center gap-1 text-surface-500 hover:text-surface-900 focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-surface-400 dark:hover:text-surface-0 flex-1 transition-colors">
              <i class="pi pi-chart-bar text-xl"></i>
              <span class="text-[10px] font-medium">Dashboard</span>
            </a>
            <a routerLink="/admin/clientes" routerLinkActive="text-primary-600 dark:text-primary-400" class="flex min-h-12 flex-col items-center justify-center gap-1 text-surface-500 hover:text-surface-900 focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-surface-400 dark:hover:text-surface-0 flex-1 transition-colors">
              <i class="pi pi-users text-xl"></i>
              <span class="text-[10px] font-medium">Clientes</span>
            </a>
            <a routerLink="/admin/prestamos" routerLinkActive="text-primary-600 dark:text-primary-400" class="flex min-h-12 flex-col items-center justify-center gap-1 text-surface-500 hover:text-surface-900 focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-surface-400 dark:hover:text-surface-0 flex-1 transition-colors">
              <i class="pi pi-wallet text-xl"></i>
              <span class="text-[10px] font-medium">Préstamos</span>
            </a>
            <a routerLink="/admin/control-diario" routerLinkActive="text-primary-600 dark:text-primary-400" class="flex min-h-12 flex-col items-center justify-center gap-1 text-surface-500 hover:text-surface-900 focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-surface-400 dark:hover:text-surface-0 flex-1 transition-colors">
              <i class="pi pi-file-excel text-xl"></i>
              <span class="text-[10px] font-medium">Control</span>
            </a>
            <a href="#" class="flex min-h-12 flex-col items-center justify-center gap-1 text-surface-500 hover:text-surface-900 focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-surface-400 dark:hover:text-surface-0 flex-1 transition-colors">
              <i class="pi pi-ellipsis-h text-xl"></i>
              <span class="text-[10px] font-medium">Más</span>
            </a>
          }
        </nav>
      </div>
    </div>
  `
})
export default class AppShell {
  layoutService = inject(LayoutService);
  authService = inject(AuthService);
}
