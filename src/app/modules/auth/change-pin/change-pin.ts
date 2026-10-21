import { Component, inject, signal } from '@angular/core';
import { form, FormField, pattern, required, submit } from '@angular/forms/signals';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-change-pin',
  imports: [ButtonModule, FormField, InputTextModule, MessageModule],
  template: `
    <main class="mx-auto flex w-full max-w-xl flex-col gap-6 p-4 sm:p-6" aria-labelledby="change-pin-title">
      <header>
        <p class="mb-1 text-sm font-medium text-primary">Seguridad de la cuenta</p>
        <h1 id="change-pin-title" class="text-2xl font-bold text-color">Cambiar PIN</h1>
        <p class="mt-2 text-sm text-muted-color">
          Confirmá tu PIN actual y elegí uno nuevo. Al terminar, deberás iniciar sesión nuevamente.
        </p>
      </header>

      @if (authService.mustChangePin()) {
        <p-message severity="warn" styleClass="w-full">
          Estás usando un PIN temporal. Debés cambiarlo antes de acceder a tu cartera.
        </p-message>
      }

      @if (error()) {
        <p-message severity="error" styleClass="w-full" role="alert">{{ error() }}</p-message>
      }

      <section class="rounded-xl border border-surface bg-surface-0 p-5 shadow-sm dark:bg-surface-900">
        <form class="flex flex-col gap-5" (submit)="changePin(); $event.preventDefault()">
          <div>
            <label for="current-pin" class="mb-2 block text-sm font-medium text-color">PIN actual</label>
            <input
              id="current-pin"
              pInputText
              type="password"
              inputmode="numeric"
              autocomplete="current-password"
              class="w-full"
              [formField]="pinForm.currentPin"
            />
            @if (pinForm.currentPin().touched() && pinForm.currentPin().invalid()) {
              <small class="mt-1 block text-red-600">{{ pinForm.currentPin().errors()[0]?.message }}</small>
            }
          </div>

          <div>
            <label for="new-pin" class="mb-2 block text-sm font-medium text-color">PIN nuevo</label>
            <input
              id="new-pin"
              pInputText
              type="password"
              inputmode="numeric"
              autocomplete="new-password"
              class="w-full"
              [formField]="pinForm.newPin"
            />
            <small class="mt-1 block text-muted-color">
              Usá 6 dígitos que no sean secuenciales, repetidos ni parte de tu DNI.
            </small>
            @if (pinForm.newPin().touched() && pinForm.newPin().invalid()) {
              <small class="mt-1 block text-red-600">{{ pinForm.newPin().errors()[0]?.message }}</small>
            }
          </div>

          <div>
            <label for="confirm-pin" class="mb-2 block text-sm font-medium text-color">Confirmar PIN nuevo</label>
            <input
              id="confirm-pin"
              pInputText
              type="password"
              inputmode="numeric"
              autocomplete="new-password"
              class="w-full"
              [formField]="pinForm.confirmPin"
            />
            @if (pinForm.confirmPin().touched() && pinForm.confirmPin().invalid()) {
              <small class="mt-1 block text-red-600">{{ pinForm.confirmPin().errors()[0]?.message }}</small>
            }
          </div>

          <p-button
            type="submit"
            label="Cambiar PIN"
            icon="pi pi-lock"
            [loading]="changing()"
            [disabled]="pinForm().invalid()"
            fluid
          />
        </form>
      </section>
    </main>
  `,
})
export default class ChangePin {
  protected readonly authService = inject(AuthService);
  protected readonly model = signal({
    currentPin: '',
    newPin: '',
    confirmPin: '',
  });
  protected readonly pinForm = form(this.model, (path) => {
    required(path.currentPin, { message: 'Ingresá tu PIN actual.' });
    pattern(path.currentPin, /^\d{6}$/, { message: 'El PIN debe contener 6 dígitos.' });
    required(path.newPin, { message: 'Ingresá el PIN nuevo.' });
    pattern(path.newPin, /^\d{6}$/, { message: 'El PIN debe contener 6 dígitos.' });
    required(path.confirmPin, { message: 'Confirmá el PIN nuevo.' });
    pattern(path.confirmPin, /^\d{6}$/, { message: 'El PIN debe contener 6 dígitos.' });
  });

  protected readonly changing = signal(false);
  protected readonly error = signal<string | null>(null);

  protected changePin(): void {
    void submit(this.pinForm, async () => {
      const value = this.model();

      if (value.newPin !== value.confirmPin) {
        this.error.set('La confirmación no coincide con el PIN nuevo.');
        return;
      }

      this.changing.set(true);
      this.error.set(null);

      try {
        await this.authService.changePin({
          currentPin: value.currentPin,
          newPin: value.newPin,
        });
      } catch (error) {
        this.error.set(error instanceof Error ? error.message : 'No se pudo cambiar el PIN.');
      } finally {
        this.changing.set(false);
      }
    });
  }
}

