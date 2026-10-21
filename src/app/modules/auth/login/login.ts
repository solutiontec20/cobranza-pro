import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
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
  private route = inject(ActivatedRoute);
  private fb = inject(FormBuilder);

  errorMessage = signal<string | null>(null);
  successMessage = signal<string | null>(
    this.route.snapshot.queryParamMap.get('pinChanged') === '1'
      ? 'Tu PIN fue actualizado. Ingresá nuevamente con el PIN nuevo.'
      : null,
  );
  loading = signal(false);
  showPin = signal(false);

  loginForm = this.fb.group({
    dni: ['', [Validators.required, Validators.pattern(/^[0-9]{8}$/)]],
    pin: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
  });

  onNumericKeyDown(event: KeyboardEvent): void {
    const allowedNavigationKeys = [
      'Backspace',
      'Tab',
      'Enter',
      'Escape',
      'ArrowLeft',
      'ArrowRight',
      'ArrowUp',
      'ArrowDown',
      'Delete',
      'Home',
      'End',
    ];

    if (allowedNavigationKeys.includes(event.key) || event.ctrlKey || event.metaKey) {
      return;
    }

    if (!/^[0-9]$/.test(event.key)) {
      event.preventDefault();
    }
  }

  onNumericInput(event: Event, field: 'dni' | 'pin'): void {
    const input = event.target as HTMLInputElement;
    const numericValue = input.value.replace(/\D/g, '');
    if (input.value !== numericValue) {
      input.value = numericValue;
      this.loginForm.get(field)?.setValue(numericValue);
    }
  }

  async onSubmit() {
    this.errorMessage.set(null);

    if (this.loginForm.invalid) {
      this.errorMessage.set('Por favor, ingrese un DNI válido (8 dígitos) y su PIN');
      return;
    }

    const { dni, pin } = this.loginForm.value;
    this.loading.set(true);

    try {
      await this.authService.login(dni!, pin!);
      this.navigateBasedOnRole();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error de autenticación';
      this.errorMessage.set(message);
    } finally {
      this.loading.set(false);
    }
  }


  private navigateBasedOnRole() {
    if (this.authService.mustChangePin()) {
      this.router.navigate(['/cambiar-pin']);
      return;
    }

    if (this.authService.isCollector()) {
      this.router.navigate(['/cobrador']);
    } else if (this.authService.isAdmin() || this.authService.isSupervisor()) {
      this.router.navigate(['/admin']);
    }
  }
}
