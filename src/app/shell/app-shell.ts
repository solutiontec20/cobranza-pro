import { Component, inject, OnInit, OnDestroy, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Topbar } from './topbar/topbar';
import { AuthService } from '../modules/auth/auth.service';
import { ToastModule } from 'primeng/toast';
import { SidebarModule } from 'primeng/sidebar';
import { AvatarModule } from 'primeng/avatar';
import { ButtonModule } from 'primeng/button';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-shell',
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet, Topbar, ToastModule, SidebarModule, AvatarModule, ButtonModule],
  template: `
      <p-toast />
      <div class="h-screen w-full bg-surface-50 dark:bg-surface-900 overflow-hidden font-sans text-surface-900 dark:text-surface-0 flex">
        <div class="border border-surface-200 dark:border-surface-700 rounded-lg overflow-hidden w-full h-full flex flex-col relative">
            <p-sidebar-layout class="min-h-192! relative! flex-1">
                @if (isMobile() && open()) {
                    <p-sidebar-backdrop class="absolute!" />
                }
                <p-sidebar id="preview" [collapsible]="isMobile() ? 'offcanvas' : 'icon'" [overlay]="isMobile()" [(open)]="open">
                    <p-sidebar-spacer />
                    <p-sidebar-aside>
                        <p-sidebar-panel>
                            <p-sidebar-header>
                                <p-sidebar-menu>
                                    <p-sidebar-menu-item>
                                        <button pSidebarMenuButton class="p-1!">
                                            <div class="flex size-6 shrink-0 items-center justify-center rounded-md bg-linear-to-br from-violet-500 to-indigo-600 text-white text-xs font-bold leading-none">
                                              <i class="pi pi-wallet"></i>
                                            </div>
                                            <span class="font-semibold text-sm">CobranzaPro</span>
                                        </button>
                                    </p-sidebar-menu-item>
                                </p-sidebar-menu>
                            </p-sidebar-header>
                            <p-sidebar-content>
                                @if (authService.currentUser()?.role === 'COBRADOR') {
                                    <p-sidebar-group>
                                        <p-sidebar-group-label>Cobrador</p-sidebar-group-label>
                                        <p-sidebar-group-content>
                                            <p-sidebar-menu>
                                                <p-sidebar-menu-item>
                                                    <a pSidebarMenuButton routerLink="/cobrador" routerLinkActive #rla1="routerLinkActive" [routerLinkActiveOptions]="{exact: true}" [isActive]="rla1.isActive">
                                                        <i class="pi pi-home"></i>
                                                        <span>Cobranza de hoy</span>
                                                    </a>
                                                </p-sidebar-menu-item>
                                                <p-sidebar-menu-item>
                                                    <a pSidebarMenuButton routerLink="/cobrador/clientes" routerLinkActive #rla2="routerLinkActive" [isActive]="rla2.isActive">
                                                        <i class="pi pi-users"></i>
                                                        <span>Mis Clientes</span>
                                                    </a>
                                                </p-sidebar-menu-item>
                                            </p-sidebar-menu>
                                        </p-sidebar-group-content>
                                    </p-sidebar-group>
                                } @else if (authService.currentUser()?.role === 'ADMINISTRADOR') {
                                    <p-sidebar-group>
                                        <p-sidebar-group-label>Administración</p-sidebar-group-label>
                                        <p-sidebar-group-content>
                                            <p-sidebar-menu>
                                                <p-sidebar-menu-item>
                                                    <a pSidebarMenuButton routerLink="/admin/dashboard" routerLinkActive #rla4="routerLinkActive" [isActive]="rla4.isActive">
                                                        <i class="pi pi-chart-bar"></i>
                                                        <span>Dashboard</span>
                                                    </a>
                                                </p-sidebar-menu-item>
                                                <p-sidebar-menu-item>
                                                    <a pSidebarMenuButton routerLink="/admin/clientes" routerLinkActive #rla5="routerLinkActive" [isActive]="rla5.isActive">
                                                        <i class="pi pi-users"></i>
                                                        <span>Clientes</span>
                                                    </a>
                                                </p-sidebar-menu-item>
                                                <p-sidebar-menu-item>
                                                    <a pSidebarMenuButton routerLink="/admin/prestamos" routerLinkActive #rla6="routerLinkActive" [isActive]="rla6.isActive">
                                                        <i class="pi pi-wallet"></i>
                                                        <span>Préstamos</span>
                                                    </a>
                                                </p-sidebar-menu-item>
                                                <p-sidebar-menu-item>
                                                    <a pSidebarMenuButton routerLink="/admin/cobradores" routerLinkActive #rla7="routerLinkActive" [isActive]="rla7.isActive">
                                                        <i class="pi pi-id-card"></i>
                                                        <span>Cobradores</span>
                                                    </a>
                                                </p-sidebar-menu-item>
                                                <p-sidebar-menu-item>
                                                    <a pSidebarMenuButton routerLink="/admin/control-diario" routerLinkActive #rla8="routerLinkActive" [isActive]="rla8.isActive">
                                                        <i class="pi pi-file-excel"></i>
                                                        <span>Control Diario</span>
                                                    </a>
                                                </p-sidebar-menu-item>
                                                <p-sidebar-menu-item>
                                                    <a pSidebarMenuButton routerLink="/admin/auditoria" routerLinkActive #rla9="routerLinkActive" [isActive]="rla9.isActive">
                                                        <i class="pi pi-shield"></i>
                                                        <span>Auditoría</span>
                                                    </a>
                                                </p-sidebar-menu-item>
                                            </p-sidebar-menu>
                                        </p-sidebar-group-content>
                                    </p-sidebar-group>
                                }
                            </p-sidebar-content>
                            <p-sidebar-footer>
                                <p-sidebar-menu>
                                    <p-sidebar-menu-item>
                                        <button pSidebarMenuButton class="p-1!">
                                            <p-avatar [label]="authService.currentUser()?.fullName?.charAt(0) || 'U'" shape="circle" class="size-6 shrink-0 text-xs font-bold bg-gradient-to-br from-indigo-500 to-purple-600 text-white" />
                                            <span class="font-semibold text-sm">{{ authService.currentUser()?.fullName || 'Usuario' }}</span>
                                        </button>
                                    </p-sidebar-menu-item>
                                </p-sidebar-menu>
                            </p-sidebar-footer>
                        </p-sidebar-panel>
                    </p-sidebar-aside>
                </p-sidebar>
                <p-sidebar-main>
                    <div class="flex items-center gap-2 border-b border-surface-200 dark:border-surface-700 px-4 py-2">
                        <button pButton class="w-8 h-8 p-0 flex items-center justify-center bg-transparent border-0 text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800 rounded-md transition-colors" (click)="open.set(!open())"><i class="pi pi-bars text-xl"></i></button>
                        <div class="flex-1">
                          <app-topbar />
                        </div>
                    </div>
                    <div class="p-4 md:p-6 overflow-auto h-[calc(100%-60px)]">
                        <router-outlet />
                    </div>
                </p-sidebar-main>
            </p-sidebar-layout>
        </div>
      </div>
  `
})
export default class AppShell implements OnInit, OnDestroy {
  authService = inject(AuthService);
  
  isMobile = signal(false);
  open = signal(true);
  
  private mql?: MediaQueryList;
  private mqlListener?: (e: MediaQueryListEvent) => void;

  ngOnInit() {
      if (typeof window === 'undefined') return;
      this.mql = window.matchMedia('(max-width: 1023px)');
      this.isMobile.set(this.mql.matches);
      this.open.set(!this.mql.matches);
      this.mqlListener = (e) => {
          this.isMobile.set(e.matches);
          this.open.set(!e.matches);
      };
      this.mql.addEventListener('change', this.mqlListener);
  }

  ngOnDestroy() {
      this.mql?.removeEventListener('change', this.mqlListener!);
  }
}

