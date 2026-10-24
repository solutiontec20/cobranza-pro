import { Component, inject } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { ThemeService } from '../../core/services/theme.service';
import { AuthService } from '../../modules/auth/auth.service';

@Component({
  selector: 'app-topbar',
  imports: [ButtonModule],
  templateUrl: './topbar.html'
})
export class Topbar {
  themeService = inject(ThemeService);
  authService = inject(AuthService);
}
