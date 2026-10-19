import { ApplicationConfig, ErrorHandler, LOCALE_ID, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { GlobalErrorHandler } from './core/errors/global-error-handler';
import { providePrimeNG } from 'primeng/config';
import { routes } from './app.routes';
import Aura from '@primeuix/themes/aura';
import { appEnv } from './core/config/app-env';
import { es } from 'primelocale/js/es.js';
import { MessageService } from 'primeng/api';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { AUTH_REPOSITORY } from './core/repositories/auth.repository';
import { SupabaseAuthRepository } from './core/adapters/supabase-auth.repository';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
    {provide:AUTH_REPOSITORY,useClass:SupabaseAuthRepository},
    provideAnimationsAsync(),
    MessageService,
    {
      provide: LOCALE_ID,
      useValue: 'es-PE',
    },
    provideRouter(routes,
      withComponentInputBinding(),
      withInMemoryScrolling({
        scrollPositionRestoration: "enabled"
      })
    ),
    providePrimeNG({
      license: appEnv.primeNgKey,
      ripple: true,
      translation: es,
      theme: {
        preset: Aura,
        options: {
          darkModeSelector: '.app-dark',
          cssLayer: {
            name: 'primeng',
            order: 'theme, base, primeng',
          },
        }
      },
    })
  ],
};
