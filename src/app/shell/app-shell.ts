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
      <div class="app-shell flex h-screen w-full overflow-hidden font-sans text-surface-900 dark:text-surface-0">
        <div class="app-shell-frame relative flex h-full w-full flex-col overflow-hidden">
            <p-sidebar-layout class="app-sidebar-layout min-h-192! relative! flex-1">
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
                                        <button pSidebarMenuButton class="app-sidebar-brand p-1!">
                                            <div class="app-brand-mark">
                                              <i class="pi pi-wallet"></i>
                                            </div>
                                            <span class="text-base font-extrabold tracking-tight text-primary">CobranzaPro</span>
                                        </button>
                                    </p-sidebar-menu-item>
                                </p-sidebar-menu>
                            </p-sidebar-header>
                            <p-sidebar-content>
                                @if (authService.mustChangePin()) {
                                    <p class="px-3 py-2 text-xs text-muted-color">
                                        Cambiá el PIN temporal para habilitar tu acceso.
                                    </p>
                                } @else if (authService.isCollector()) {
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
                                } @else {
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
                                <p-sidebar-group>
                                    <p-sidebar-group-label>Seguridad</p-sidebar-group-label>
                                    <p-sidebar-group-content>
                                        <p-sidebar-menu>
                                            <p-sidebar-menu-item>
                                                <a pSidebarMenuButton routerLink="/cambiar-pin" routerLinkActive #pinRla="routerLinkActive" [isActive]="pinRla.isActive">
                                                    <i class="pi pi-lock"></i>
                                                    <span>Cambiar PIN</span>
                                                </a>
                                            </p-sidebar-menu-item>
                                        </p-sidebar-menu>
                                    </p-sidebar-group-content>
                                </p-sidebar-group>
                            </p-sidebar-content>
                            <p-sidebar-footer>
                                <p-sidebar-menu>
                                    <p-sidebar-menu-item>
                                        <div class="flex items-center justify-between w-full px-2 py-1.5 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors">
                                            <div class="flex items-center gap-2 overflow-hidden flex-1 min-w-0">
                                                <p-avatar [label]="authService.currentUser()?.fullName?.charAt(0) || 'U'" shape="circle" class="size-7 shrink-0 text-xs font-bold bg-gradient-to-br from-indigo-500 to-purple-600 text-white" />
                                                <div class="flex flex-col min-w-0">
                                                    <span class="font-semibold text-xs truncate text-surface-800 dark:text-surface-100">{{ authService.currentUser()?.fullName || 'Usuario' }}</span>
                                                    <span class="text-[10px] text-surface-400 capitalize truncate">{{ authService.currentUser()?.role || '' }}</span>
                                                </div>
                                            </div>
                                            <button
                                                pButton
                                                type="button"
                                                [text]="true"
                                                [rounded]="true"
                                                severity="danger"
                                                class="text-surface-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 w-8 h-8 p-0 shrink-0 flex items-center justify-center transition-colors cursor-pointer ml-1"
                                                (click)="authService.logout()"
                                                title="Cerrar sesión"
                                                aria-label="Cerrar sesión">
                                                <i class="pi pi-sign-out text-base"></i>
                                            </button>
                                        </div>
                                    </p-sidebar-menu-item>
                                </p-sidebar-menu>
                            </p-sidebar-footer>
                        </p-sidebar-panel>
                    </p-sidebar-aside>
                </p-sidebar>
                <p-sidebar-main class="app-workspace">
                    <div class="app-topbar flex items-center gap-2 px-3 sm:px-4">
                        <button pButton class="app-menu-button flex h-10 w-10 items-center justify-center rounded-lg bg-transparent p-0 transition-colors" (click)="open.set(!open())" aria-label="Abrir o cerrar navegación"><i class="pi pi-bars text-lg"></i></button>
                        <div class="flex-1">
                          <app-topbar />
                        </div>
                    </div>
                    <div class="app-content p-3 sm:p-5 lg:p-7">
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

