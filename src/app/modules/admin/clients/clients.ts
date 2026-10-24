import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import {
  form,
  FormField,
  maxLength,
  pattern,
  required,
  submit,
} from '@angular/forms/signals';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { SkeletonModule } from 'primeng/skeleton';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ClientListItem } from '../../../core/models/client.model';
import { ClientsStore } from './clients.store';

interface ClientFormModel {
  dni: string;
  fullName: string;
  phone: string;
  collectorId: string;
  address: string;
  notes: string;
  active: boolean;
}

const emptyModel = (): ClientFormModel => ({
  dni: '',
  fullName: '',
  phone: '',
  collectorId: '',
  address: '',
  notes: '',
  active: true,
});

@Component({
  selector: 'app-admin-clients',
  imports: [
    ButtonModule,
    CurrencyPipe,
    DialogModule,
    FormField,
    InputTextModule,
    MessageModule,
    SelectModule,
    SkeletonModule,
    TableModule,
    TagModule,
  ],
  templateUrl: `./clients.html`,
})
export default class Clients {
  protected readonly store = inject(ClientsStore);
  private readonly messageService = inject(MessageService);

  protected readonly loadingRows = [1, 2, 3];
  protected readonly searchQuery = signal('');
  protected readonly selectedCollector = signal('');
  protected readonly dialogVisible = signal(false);
  protected readonly dialogMode = signal<'create' | 'edit'>('create');
  protected readonly editingClientId = signal('');
  protected readonly clientModel = signal<ClientFormModel>(emptyModel());
  protected readonly clientForm = form(this.clientModel, (path) => {
    required(path.dni, { message: 'Ingresá el DNI.' });
    pattern(path.dni, /^\d{8,12}$/, { message: 'El DNI debe contener entre 8 y 12 dígitos.' });
    required(path.fullName, { message: 'Ingresá el nombre completo.' });
    pattern(path.fullName, /.*\S.*/, { message: 'Ingresá un nombre válido.' });
    maxLength(path.fullName, 160, { message: 'El nombre es demasiado largo.' });
    pattern(path.phone, /^\d{0,15}$/, { message: 'El teléfono solo puede contener dígitos.' });
    required(path.collectorId, { message: 'Seleccioná un cobrador.' });
    required(path.address, { message: 'Ingresá la dirección.' });
    pattern(path.address, /.*\S.*/, { message: 'Ingresá una dirección válida.' });
    maxLength(path.notes, 500, { message: 'Las observaciones no pueden superar 500 caracteres.' });
  });

  protected readonly filteredClients = computed(() => {
    const query = this.normalize(this.searchQuery());
    const collectorId = this.selectedCollector();

    return this.store.clients().filter((client) => {
      const matchesQuery =
        !query ||
        this.normalize(client.fullName).includes(query) ||
        client.dni.includes(query);
      const matchesCollector = !collectorId || client.collectorId === collectorId;
      return matchesQuery && matchesCollector;
    });
  });
  protected readonly editingClient = computed(() =>
    this.store.clients().find((client) => client.id === this.editingClientId()),
  );

  constructor() {
    void this.store.load();
  }

  protected updateSearch(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
  }

  protected updateCollector(event: Event): void {
    this.selectedCollector.set((event.target as HTMLSelectElement).value);
  }

  protected openCreateDialog(): void {
    this.store.clearError();
    this.dialogMode.set('create');
    this.editingClientId.set('');
    this.clientForm().reset();
    this.clientModel.set(emptyModel());
    this.dialogVisible.set(true);
  }

  protected openEditDialog(client: ClientListItem): void {
    this.store.clearError();
    this.dialogMode.set('edit');
    this.editingClientId.set(client.id);
    this.clientForm().reset();
    this.clientModel.set({
      dni: client.dni,
      fullName: client.fullName,
      phone: client.phone,
      collectorId: client.collectorId,
      address: client.address,
      notes: client.notes,
      active: client.active,
    });
    this.dialogVisible.set(true);
  }

  protected saveClient(): void {
    void submit(this.clientForm, async () => {
      const model = this.clientModel();
      const saved = this.dialogMode() === 'create'
        ? await this.store.create(model)
        : await this.store.update({
          ...model,
          id: this.editingClientId(),
        });

      if (saved) {
        this.dialogVisible.set(false);
        const isCreate = this.dialogMode() === 'create';
        this.messageService.add({
          severity: 'success',
          summary: isCreate ? 'Cliente registrado' : 'Cliente actualizado',
          detail: isCreate
            ? 'El cliente ya está disponible para crear un préstamo.'
            : 'Los datos y la asignación del cliente fueron actualizados.',
        });
      }
    });
  }

  protected riskLabel(client: ClientListItem): string {
    if (client.isBlacklisted) return `Moroso (${client.overdueDays} d)`;
    if (client.overdueDays > 0) return `Atraso (${client.overdueDays} d)`;
    if (client.outstandingAmount > 0) return 'Al día';
    return 'Sin préstamo';
  }

  protected riskSeverity(client: ClientListItem): 'success' | 'warn' | 'danger' | 'secondary' {
    if (client.isBlacklisted) return 'danger';
    if (client.overdueDays > 0) return 'warn';
    if (client.outstandingAmount > 0) return 'success';
    return 'secondary';
  }

  private normalize(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('es-PE')
      .trim();
  }
}
