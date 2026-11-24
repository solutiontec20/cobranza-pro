import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'auth-layout',
  imports: [RouterOutlet],
  template: `
    <main class="auth-screen flex w-full overflow-x-hidden bg-[#0b1220] font-sans">
      <!-- PC: panel de marca (siempre navy) -->
      <section
        class="relative hidden overflow-hidden bg-[#0b1220] px-8 py-6 lg:flex lg:w-1/2 lg:flex-col xl:px-12 xl:py-8"
        aria-label="Presentación de CobranzaPro"
      >
        <div class="relative z-10 shrink-0">
          <img
            src="/cobranzapro-quipu-horizontal-oscuro.svg"
            alt="CobranzaPro"
            class="mb-10 h-10 w-auto xl:mb-14 xl:h-12"
          />
          <p class="max-w-xl text-4xl font-bold leading-[1.1] tracking-tight text-white xl:text-5xl">
            Cuentas claras, <br />
            <span class="text-[#60a5fa]">cobranza al día.</span>
          </p>
          <p class="mt-4 max-w-md text-base leading-relaxed text-slate-300 xl:text-lg">
            Clientes, préstamos y cobranzas en un solo lugar.
          </p>
        </div>

        <!-- La ilustración ocupa el espacio que sobra entre el texto y el pie -->
        <div class="relative -mx-8 mt-8 min-h-48 flex-1 xl:-mx-12" aria-hidden="true">
          <div
            class="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_75%,rgb(37_99_235/0.20),transparent_65%)]"
          ></div>
          <img
            src="/cobranzapro-login-ilustracion-pc.svg"
            alt=""
            class="pointer-events-none absolute inset-0 h-full w-full object-cover object-top"
          />
          <div
            class="absolute inset-x-0 bottom-0 h-28 bg-linear-to-t from-[#0b1220] to-transparent"
          ></div>
        </div>

        <p class="relative z-10 flex shrink-0 items-center gap-2 pt-4 text-sm font-medium text-slate-400">
          <i class="pi pi-shield" aria-hidden="true"></i>
          <span>Plataforma segura · Datos cifrados</span>
        </p>
      </section>
      

      <!-- Formulario -->
      <section
        class="auth-panel relative flex w-full flex-col overflow-y-auto bg-[#0b1220] px-7 lg:w-1/2 lg:border-l lg:border-(--cp-border) lg:bg-(--cp-panel) lg:px-0"
        aria-labelledby="login-title"
      >
        <!-- Móvil: cabecera con el quipu -->
        <div class="pointer-events-none absolute inset-x-0 top-0 h-52 overflow-hidden lg:hidden" aria-hidden="true">
          <img
            src="/cobranzapro-login-ilustracion-movil.svg"
            alt=""
            class="h-full w-full object-cover object-top"
          />
          <div class="absolute inset-x-0 bottom-0 h-24 bg-linear-to-t from-[#0b1220] to-transparent"></div>
        </div>

        <div class="relative z-10 mx-auto mt-48 mb-8 w-full max-w-[420px] lg:mt-auto lg:mb-auto lg:px-0">
          <img
            src="/cobranzapro-quipu-horizontal-oscuro.svg"
            alt="CobranzaPro"
            class="mb-8 h-10 w-auto lg:hidden"
          />

          <h1
            id="login-title"
            class="mb-2 text-left text-3xl font-bold tracking-tight text-white text-balance lg:text-(--cp-text)"
          >
            Bienvenido
          </h1>
          <p class="mb-7 text-left text-slate-400 lg:text-(--cp-muted)">
            Ingresa tus credenciales para continuar
          </p>

          <router-outlet />
        </div>

        <!-- Móvil: pie anclado abajo -->
        <p class="relative z-10 mt-auto pb-2 text-center text-xs font-medium text-slate-500 lg:hidden">
          Plataforma segura · Datos cifrados
        </p>
      </section>
    </main>
  `,
})
export default class AuthLayout {}
