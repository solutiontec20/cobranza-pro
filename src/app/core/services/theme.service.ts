import { Injectable, signal, effect } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  isDark = signal<boolean>(false);

  constructor() {
    // Inicializar desde localStorage o preferir light
    const stored = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (stored === 'dark' || (!stored && prefersDark)) {
      this.isDark.set(true);
    } else {
      this.isDark.set(false);
    }

    // Efecto para actualizar el DOM cuando cambie la señal
    effect(() => {
      const dark = this.isDark();
      if (dark) {
        document.documentElement.classList.add('app-dark');
        document.documentElement.classList.add('dark');
        localStorage.setItem('theme', 'dark');
      } else {
        document.documentElement.classList.remove('app-dark');
        document.documentElement.classList.remove('dark');
        localStorage.setItem('theme', 'light');
      }
    });
  }

  toggleTheme() {
    this.isDark.update(v => !v);
  }
}
