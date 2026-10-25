import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { form, FormField, maxLength, pattern, required, submit } from '@angular/forms/signals';
import { AuthService } from '../auth.service';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';

interface LoginModel {
  dni: string;
  pin: string;
}

@Component({
  selector: 'login-form',
  imports: [FormField, ButtonModule, InputTextModule, IconField, InputIcon],
  templateUrl: './login.html',
})
export default class Login {
  private authService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  errorMessage = signal<string | null>(null);
  successMessage = signal<string | null>(
    this.route.snapshot.queryParamMap.get('pinChanged') === '1'
      ? 'Tu PIN fue actualizado. Ingresá nuevamente con el PIN nuevo.'
      : null,
  );
  loading = signal(false);
  showPin = signal(false);

  protected readonly model = signal<LoginModel>({ dni: '', pin: '' });
  protected readonly loginForm = form(this.model, (path) => {
    required(path.dni, { message: 'Ingresá tu DNI.' });
    pattern(path.dni, /^\d{8}$/, { message: 'El DNI debe contener 8 dígitos.' });
    maxLength(path.dni, 8, { message: 'El DNI debe contener 8 dígitos.' });
    required(path.pin, { message: 'Ingresá tu PIN.' });
    pattern(path.pin, /^\d{6}$/, { message: 'El PIN debe contener 6 dígitos.' });
    maxLength(path.pin, 6, { message: 'El PIN debe contener 6 dígitos.' });
  });

  async onSubmit() {
    this.errorMessage.set(null);

    void submit(this.loginForm, async () => {
      const { dni, pin } = this.model();
      this.loading.set(true);

      try {
        await this.authService.login(dni, pin);
        this.navigateBasedOnRole();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Error de autenticación';
        this.errorMessage.set(message);
      } finally {
        this.loading.set(false);
      }
    });
  }

  /**
   * Blocks any keystroke, paste or autofill that would insert a non-digit
   * character into the DNI/PIN fields, so letters and symbols can never be
   * typed in the first place (the `pattern`/`maxLength` validators above
   * still run as a safety net, e.g. for browsers without `beforeinput`).
   */
  protected blockNonNumericInput(event: InputEvent): void {
    const incomingText = event.data;
    if (incomingText !== null && !/^\d*$/.test(incomingText)) {
      event.preventDefault();
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
