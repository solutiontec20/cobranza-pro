import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'auth-layout',
  imports: [RouterOutlet],
  template: `

  <div class="flex min-h-screen w-full bg-surface-50 dark:bg-surface-900 font-sans">
  <div class="hidden lg:flex lg:w-1/2 relative bg-primary-900 overflow-hidden flex-col justify-between p-12">
    <div class="absolute -top-40 -right-40 w-96 h-96 bg-primary-600 rounded-full blur-3xl opacity-70"></div>
    <div class="absolute top-40 -left-20 w-72 h-72 bg-blue-500 rounded-full blur-3xl opacity-70"></div>
    <div class="absolute -bottom-40 left-20 w-96 h-96 bg-indigo-600 rounded-full blur-3xl opacity-70"></div>

    <div class="relative z-10">
      <div class="flex items-center gap-3 mb-16">
        <div class="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-lg">
          <i class="pi pi-wallet text-2xl text-primary-600"></i>
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
        <i class="pi pi-shield"></i>
        <span>Plataforma segura · Datos cifrados</span>
      </div>
    </div>
  </div>

  <div class="w-full lg:w-1/2 flex flex-col justify-center items-center p-6 relative bg-surface-0 dark:bg-surface-800">

    <div class="w-full max-w-[420px]">
      <div class="lg:hidden flex items-center gap-3 mb-10 justify-center">
        <div class="w-12 h-12 bg-primary-500 rounded-xl flex items-center justify-center shadow-lg">
          <i class="pi pi-wallet text-2xl text-white"></i>
        </div>
        <span class="text-3xl font-extrabold text-surface-900 dark:text-surface-0 tracking-tight">CobranzaPro</span>
      </div>

      <h2 class="text-3xl font-bold text-surface-900 dark:text-surface-0 mb-2 text-center lg:text-left">
        Bienvenido
      </h2>
      <p class="text-surface-500 dark:text-surface-400 mb-8 text-center lg:text-left">
        Ingresá tus credenciales para continuar
      </p>
      <router-outlet />

    </div>
  </div>
</div>

  `,
})
export default class AuthLayout { }
