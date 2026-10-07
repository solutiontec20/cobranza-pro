import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Sidebar } from './sidebar/sidebar';
import { Topbar } from './topbar/topbar';


@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet,
    Sidebar,
    Topbar,
  ],
  template: `
    <topbar />

    <div class="flex min-h-dvh">
      <sidebar />

      <main class="min-w-0 flex-1">
        <router-outlet />
      </main>
    </div>
  `,
})
export default class AppShell { }
