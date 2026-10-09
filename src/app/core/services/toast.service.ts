
import { inject, Service } from '@angular/core';
import { MessageService } from 'primeng/api';

type ToastType = "info" | "success" | "warn" | "error"


const TOAST_SUMMARY: Record<ToastType, string> = {
  info: 'Informacion',
  success: "Exito",
  warn: "Advertencia",
  error: "Error",

}

@Service()
export class ToastService {

  private messageService = inject(MessageService);


  show(message: string, type: ToastType = 'info') {
    this.messageService.add({
      severity: type,
      summary: TOAST_SUMMARY[type],
      detail: message
    })
  }
  success(message: string): void {
    this.show(message, 'success');
  }

  info(message: string): void {
    this.show(message, 'info');
  }

  warn(message: string): void {
    this.show(message, 'warn');
  }

  error(message: string): void {
    this.show(message, 'error');
  }

}
