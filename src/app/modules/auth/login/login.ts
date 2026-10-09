import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../auth.service';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { AutoFocusModule } from 'primeng/autofocus';
@Component({
  selector: 'login-form',
  imports: [ReactiveFormsModule, ButtonModule, InputTextModule, IconField, InputIcon],
  templateUrl: './login.html',
})
export default class Login {

  private authService = inject(AuthService);
  private router = inject(Router);
  private fb = inject(FormBuilder);

  errorMessage = signal<string | null>(null);

  loginForm = this.fb.group({
    dni: ['', [Validators.required, Validators.minLength(8)]],
    pin: ['', [Validators.required]]
  });

  onSubmit() {
    this.errorMessage.set(null);
    if (this.loginForm.invalid) {
      this.errorMessage.set('Por favor, ingrese DNI y PIN válidos');
      return;
    }

    const { dni, pin } = this.loginForm.value;
    const result = this.authService.login(dni!, pin!);

    if (result.success) {
      this.navigateBasedOnRole();
    } else {
      this.errorMessage.set(result.error || 'Error de autenticación');
    }
  }

  quickLogin(profileId: string) {
    this.errorMessage.set(null);
    if (this.authService.switchUser(profileId)) {
      this.navigateBasedOnRole();
    } else {
      this.errorMessage.set('Error al cambiar de usuario');
    }
  }

  private navigateBasedOnRole() {
    if (this.authService.isCollector()) {
      this.router.navigate(['/cobrador']);
    } else if (this.authService.isAdmin()) {
      this.router.navigate(['/admin']);
    }
  }
}
