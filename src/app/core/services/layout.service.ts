import { Service, signal } from '@angular/core';

@Service()
export class LayoutService {
  sidebarCollapsed = signal<boolean>(false);

  toggleSidebar() {
    this.sidebarCollapsed.update(v => !v);
  }
}
