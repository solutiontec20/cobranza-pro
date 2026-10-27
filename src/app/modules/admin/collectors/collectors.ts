import { Component, inject, signal } from '@angular/core';
import { form, FormField, minLength, pattern, required, submit } from '@angular/forms/signals';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SkeletonModule } from 'primeng/skeleton';
import { TagModule } from 'primeng/tag';
import { Collector } from '../../../core/models/collector.model';
import { DigitsOnly } from '../../../shared/directives/digits-only';
import { EsDate } from '../../../shared/pipes/es-date';
import { AuthService } from '../../auth/auth.service';
import { CollectorsStore } from './collectors.store';

const EMPTY_CREATE_MODEL = { fullName: '', dni: '', phone: '', temporaryPin: '' };
const EMPTY_RESET_MODEL = { reason: '' };
const EMPTY_EDIT_MODEL = { fullName: '', phone: '', reason: '' };

@Component({
  selector: 'app-collectors',
  imports: [
    ButtonModule,
    DialogModule,
    DigitsOnly,
    EsDate,
    FormField,
    InputTextModule,
    MessageModule,
    SkeletonModule,
    TagModule,
  ],
  templateUrl: `./collectors.html`,
})
export default class Collectors {
  protected readonly store = inject(CollectorsStore);
  protected readonly authService = inject(AuthService);
  private readonly messageService = inject(MessageService);
  protected readonly loadingRows = [1, 2, 3];
  protected readonly createVisible = signal(false);
  protected readonly statusVisible = signal(false);
  protected readonly resetVisible = signal(false);
  protected readonly editVisible = signal(false);
  protected readonly resetResult = signal<{ collectorName: string; temporaryPin: string } | null>(null);
  protected readonly selectedCollector = signal<Collector | null>(null);

  protected readonly createModel = signal({ ...EMPTY_CREATE_MODEL });
  protected readonly createForm = form(this.createModel, (path) => {
    required(path.fullName, { message: 'Ingresá el nombre completo.' });
    minLength(path.fullName, 3, { message: 'El nombre debe tener al menos 3 caracteres.' });
    required(path.dni, { message: 'Ingresá el DNI.' });
    pattern(path.dni, /^\d{8}$/, { message: 'El DNI debe contener 8 dígitos.' });
    pattern(path.phone, /^(?:9\d{8})?$/, {
      message: 'El teléfono debe contener 9 dígitos e iniciar en 9.',
    });
    required(path.temporaryPin, { message: 'Ingresá el PIN temporal.' });
    pattern(path.temporaryPin, /^\d{6}$/, { message: 'El PIN temporal debe contener 6 dígitos.' });
  });
  protected readonly statusModel = signal({ reason: '' });
  protected readonly statusForm = form(this.statusModel, (path) => {
    required(path.reason, { message: 'Ingresá el motivo del cambio.' });
    minLength(path.reason, 5, { message: 'Detallá el motivo en al menos 5 caracteres.' });
  });
  protected readonly resetModel = signal({ ...EMPTY_RESET_MODEL });
  protected readonly resetForm = form(this.resetModel, (path) => {
    required(path.reason, { message: 'Ingresá el motivo del restablecimiento.' });
    minLength(path.reason, 5, { message: 'Detallá el motivo en al menos 5 caracteres.' });
  });
  protected readonly editModel = signal({ ...EMPTY_EDIT_MODEL });
  protected readonly editForm = form(this.editModel, (path) => {
    required(path.fullName, { message: 'Ingresá el nombre completo.' });
    minLength(path.fullName, 3, { message: 'El nombre debe tener al menos 3 caracteres.' });
    pattern(path.phone, /^(?:9\d{8})?$/, {
      message: 'El teléfono debe contener 9 dígitos e iniciar en 9.',
    });
    required(path.reason, { message: 'Ingresá el motivo de la edición.' });
    minLength(path.reason, 5, { message: 'Detallá el motivo en al menos 5 caracteres.' });
  });

  constructor() {
    void this.store.load();
  }

  protected searchValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected openCreateDialog(): void {
    this.store.clearError();
    this.createModel.set({ ...EMPTY_CREATE_MODEL });
    this.createForm().reset();
    this.createVisible.set(true);
  }

  protected createCollector(): void {
    void submit(this.createForm, async () => {
      const value = this.createModel();
      const created = await this.store.create({
        fullName: value.fullName.trim(),
        dni: value.dni,
        phone: value.phone.trim() || null,
        temporaryPin: value.temporaryPin,
      });
      if (created) {
        this.createVisible.set(false);
        this.messageService.add({
          severity: 'success',
          summary: 'Cobrador creado',
          detail: 'El acceso fue creado. Deberá cambiar el PIN temporal al iniciar sesión.',
        });
      }
    });
  }

  protected openStatusDialog(collector: Collector): void {
    this.store.clearError();
    this.selectedCollector.set(collector);
    this.statusModel.set({ reason: '' });
    this.statusForm().reset();
    this.statusVisible.set(true);
  }

  protected changeStatus(): void {
    const collector = this.selectedCollector();
    if (!collector) return;
    void submit(this.statusForm, async () => {
      const changed = await this.store.setActive({
        collectorId: collector.id,
        active: !collector.active,
        reason: this.statusModel().reason.trim(),
      });
      if (changed) {
        this.statusVisible.set(false);
        this.messageService.add({
          severity: 'success',
          summary: 'Estado actualizado',
          detail: `El cobrador quedó ${collector.active ? 'inactivo' : 'activo'}.`,
        });
      }
    });
  }

  protected openResetDialog(collector: Collector): void {
    this.store.clearError();
    this.selectedCollector.set(collector);
    this.resetResult.set(null);
    this.resetForm().reset();
    this.resetModel.set({ ...EMPTY_RESET_MODEL });
    this.resetVisible.set(true);
  }

  protected setResetVisible(visible: boolean): void {
    this.resetVisible.set(visible);
    if (!visible) {
      this.resetResult.set(null);
    }
  }

  protected resetPin(): void {
    const collector = this.selectedCollector();
    if (!collector) return;

    void submit(this.resetForm, async () => {
      const result = await this.store.resetPin({
        collectorId: collector.id,
        reason: this.resetModel().reason.trim(),
      });

      if (result) {
        this.resetResult.set({
          collectorName: result.collectorName,
          temporaryPin: result.temporaryPin,
        });
      }
    });
  }

  protected openEditDialog(collector: Collector): void {
    this.store.clearError();
    this.selectedCollector.set(collector);
    this.editModel.set({
      fullName: collector.fullName,
      phone: collector.phone ?? '',
      reason: '',
    });
    this.editForm().reset();
    this.editVisible.set(true);
  }

  protected editCollector(): void {
    const collector = this.selectedCollector();
    if (!collector) return;

    void submit(this.editForm, async () => {
      const value = this.editModel();
      const updated = await this.store.update({
        collectorId: collector.id,
        fullName: value.fullName.trim(),
        phone: value.phone.trim() || null,
        reason: value.reason.trim(),
      });

      if (updated) {
        this.editVisible.set(false);
        this.messageService.add({
          severity: 'success',
          summary: 'Datos actualizados',
          detail: 'Los datos del cobrador fueron editados correctamente.',
        });
      }
    });
  }
}
