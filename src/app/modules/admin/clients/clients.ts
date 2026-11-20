import { Component, computed, effect, inject, linkedSignal, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
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
import { PaginatorModule } from 'primeng/paginator';
import { SelectModule } from 'primeng/select';
import { SkeletonModule } from 'primeng/skeleton';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { map } from 'rxjs';
import { ClientListItem } from '../../../core/models/client.model';
import { DigitsOnly } from '../../../shared/directives/digits-only';
import { PenCurrency } from '../../../shared/pipes/pen-currency';
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
    DigitsOnly,
    DialogModule,
    FormField,
    InputTextModule,
    MessageModule,
    PaginatorModule,
    PenCurrency,
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
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly collectorIdFromUrl = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get('collectorId') ?? '')),
    { initialValue: this.route.snapshot.queryParamMap.get('collectorId') ?? '' },
  );

  protected readonly loadingRows = [1, 2, 3];
  protected readonly searchQuery = signal('');
  protected readonly selectedCollector = linkedSignal(() => this.collectorIdFromUrl());
  protected readonly dialogVisible = signal(false);
  protected readonly dialogMode = signal<'create' | 'edit'>('create');
  protected readonly editingClientId = signal('');
  private readonly editBaseline = signal<ClientFormModel | null>(null);
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

  protected readonly hasClientChanges = computed(() => {
    if (this.dialogMode() === 'create') return true;
    const baseline = this.editBaseline();
    if (!baseline) return false;
    return !sameClientModel(baseline, this.clientModel());
  });
  protected readonly editingClient = computed(() =>
    this.store.clients().find((client) => client.id === this.editingClientId()),
  );

  constructor() {
    void this.store.initialize(this.collectorIdFromUrl() || null);

    effect(() => {
      void this.store.setCollectorFilter(this.collectorIdFromUrl() || null);
    });

    effect((onCleanup) => {
      const search = this.searchQuery();
      const timer = setTimeout(() => void this.store.setSearch(search), 300);
      onCleanup(() => clearTimeout(timer));
    });
  }

  protected updateSearch(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
  }

  protected updateCollector(event: Event): void {
    const collectorId = (event.target as HTMLSelectElement).value;
    this.selectedCollector.set(collectorId);
    void this.store.setCollectorFilter(collectorId || null);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { collectorId: collectorId || null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected openCreateDialog(): void {
    this.store.clearError();
    this.dialogMode.set('create');
    this.editingClientId.set('');
    this.editBaseline.set(null);
    this.clientForm().reset();
    this.clientModel.set(emptyModel());
    this.dialogVisible.set(true);
  }

  protected openEditDialog(client: ClientListItem): void {
    this.store.clearError();
    this.dialogMode.set('edit');
    this.editingClientId.set(client.id);
    this.clientForm().reset();
    const model = {
      dni: client.dni,
      fullName: client.fullName,
      phone: client.phone,
      collectorId: client.collectorId,
      address: client.address,
      notes: client.notes,
      active: client.active,
    };
    this.editBaseline.set(model);
    this.clientModel.set(model);
    this.dialogVisible.set(true);
  }

  protected saveClient(): void {
    if (this.dialogMode() === 'edit' && !this.hasClientChanges()) return;

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

  protected changePage(event: { first?: number; rows?: number }): void {
    void this.store.setPage(event.first ?? 0, event.rows ?? this.store.pageSize());
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
}

function sameClientModel(left: ClientFormModel, right: ClientFormModel): boolean {
  return (
    left.dni.trim() === right.dni.trim() &&
    left.fullName.trim() === right.fullName.trim() &&
    left.phone.trim() === right.phone.trim() &&
    left.collectorId === right.collectorId &&
    left.address.trim() === right.address.trim() &&
    left.notes.trim() === right.notes.trim() &&
    left.active === right.active
  );
}
