import { Component, inject, input, signal } from '@angular/core';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { LoanDetail } from '../../../core/models/loan.model';
import { LoanStatementShareService } from '../../../core/services/loan-statement-share.service';

@Component({
  selector: 'app-loan-statement-actions',
  imports: [ButtonModule],
  host: { class: 'block' },
  template: `
    @if (detail().loan.status !== 'voided') {
      <div role="group" aria-label="Estado de cuenta del préstamo" class="flex flex-col gap-3">
        <div>
          <h3 class="m-0 text-sm font-semibold text-surface-800 dark:text-surface-100">
            Estado de cuenta
          </h3>
          <p class="mt-1 mb-0 text-xs text-surface-500 dark:text-surface-400">
            Cronograma, pagos realizados y saldo pendiente en un texto para enviar al cliente.
          </p>
        </div>
        <div class="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          @if (statement.canShareText()) {
            <button
              pButton
              type="button"
              class="w-full justify-center sm:w-auto"
              [disabled]="busy()"
              (click)="shareText()"
            >
              <i class="pi pi-share-alt" aria-hidden="true"></i> Compartir
            </button>
          }
          @if (statement.canShareFile()) {
            <button
              pButton
              type="button"
              severity="secondary"
              variant="outlined"
              class="w-full justify-center sm:w-auto"
              [disabled]="busy()"
              (click)="shareFile()"
            >
              <i class="pi pi-paperclip" aria-hidden="true"></i> Enviar archivo .txt
            </button>
          }
          <button
            pButton
            type="button"
            severity="secondary"
            variant="outlined"
            class="w-full justify-center sm:w-auto"
            [disabled]="busy()"
            (click)="download()"
          >
            <i class="pi pi-download" aria-hidden="true"></i> Descargar .txt
          </button>
          @if (statement.canCopy()) {
            <button
              pButton
              type="button"
              severity="secondary"
              variant="outlined"
              class="w-full justify-center sm:w-auto"
              [disabled]="busy()"
              (click)="copy()"
            >
              <i class="pi pi-copy" aria-hidden="true"></i> Copiar texto
            </button>
          }
        </div>
      </div>
    }
  `,
})
export class LoanStatementActions {
  readonly detail = input.required<LoanDetail>();

  protected readonly statement = inject(LoanStatementShareService);
  private readonly messageService = inject(MessageService);
  protected readonly busy = signal(false);

  protected shareText(): Promise<void> {
    return this.run(() => this.statement.shareText(this.detail()), 'No se pudo compartir.');
  }

  protected shareFile(): Promise<void> {
    return this.run(() => this.statement.shareFile(this.detail()), 'No se pudo compartir.');
  }

  protected download(): Promise<void> {
    return this.run(async () => {
      this.statement.download(this.detail());
      this.notify('Estado de cuenta descargado', 'Revise la carpeta de descargas del dispositivo.');
    }, 'No se pudo descargar el archivo.');
  }

  protected copy(): Promise<void> {
    return this.run(async () => {
      await this.statement.copy(this.detail());
      this.notify('Texto copiado', 'Ya puede pegarlo en WhatsApp, correo o un mensaje.');
    }, 'No se pudo copiar el texto.');
  }

  private async run(action: () => Promise<unknown>, failure: string): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await action();
    } catch {
      this.messageService.add({
        severity: 'error',
        summary: 'Estado de cuenta',
        detail: `${failure} Intente nuevamente o use otra opción.`,
      });
    } finally {
      this.busy.set(false);
    }
  }

  private notify(summary: string, detail: string): void {
    this.messageService.add({ severity: 'success', summary, detail });
  }
}
