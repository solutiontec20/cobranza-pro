import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'auth-layout',
  imports: [RouterOutlet],
  template: `

  <main class="auth-screen flex w-full overflow-x-hidden bg-surface-50 font-sans dark:bg-surface-900">
  <section class="relative hidden overflow-hidden bg-primary-900 p-12 lg:flex lg:w-1/2 lg:flex-col lg:justify-between" aria-label="Presentación de CobranzaPro">
    <div class="absolute -top-40 -right-40 w-96 h-96 bg-primary-600 rounded-full blur-3xl opacity-70"></div>
    <div class="absolute top-40 -left-20 w-72 h-72 bg-blue-500 rounded-full blur-3xl opacity-70"></div>
    <div class="absolute -bottom-40 left-20 w-96 h-96 bg-indigo-600 rounded-full blur-3xl opacity-70"></div>

    <div class="relative z-10">
      <div class="flex items-center gap-3 mb-16">
        <div class="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-lg">
          <i class="pi pi-wallet text-2xl text-primary-600" aria-hidden="true"></i>
        </div>
        <span class="text-3xl font-extrabold text-white tracking-tight">CobranzaPro</span>
      </div>
      <h1 class="text-5xl font-extrabold text-white leading-tight max-w-lg">
        El control financiero <br />
        <span class="text-primary-300">en tus manos.</span>
      </h1>
      <p class="text-lg text-primary-100 mt-6 max-w-md leading-relaxed">
        Administra tus clientes, préstamos y cobranzas con la plataforma más rápida y segura del mercado.
      </p>
    </div>

    <div class="relative z-10">
      <div class="flex items-center gap-4 text-primary-200 text-sm font-medium">
        <i class="pi pi-shield" aria-hidden="true"></i>
        <span>Plataforma segura · Datos cifrados</span>
      </div>
    </div>
  </section>

  <section class="auth-panel relative flex w-full items-center justify-start overflow-y-auto bg-surface-0 lg:w-1/2 dark:bg-surface-800" aria-labelledby="login-title">

    <div class="mx-auto my-auto w-full max-w-[420px]">
      <div class="mb-8 flex items-center justify-center gap-3 lg:hidden">
        <div class="w-12 h-12 bg-primary-500 rounded-xl flex items-center justify-center shadow-lg">
          <i class="pi pi-wallet text-2xl text-white" aria-hidden="true"></i>
        </div>
        <span class="text-3xl font-extrabold text-surface-900 dark:text-surface-0 tracking-tight">CobranzaPro</span>
      </div>

      <h1 id="login-title" class="mb-2 text-center text-3xl font-bold text-surface-900 text-balance lg:text-left dark:text-surface-0">
        Bienvenido
      </h1>
      <p class="mb-7 text-center text-surface-500 lg:text-left dark:text-surface-400">
        Ingresá tus credenciales para continuar
      </p>
      <router-outlet />

    </div>
  </section>
</main>

  `,
})
export default class AuthLayout { }
