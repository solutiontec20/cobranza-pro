import { Component, computed, inject, signal } from '@angular/core';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { SelectModule } from 'primeng/select';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { CurrencyPipe } from '@angular/common';
import { AppStoreService, SYSTEM_DATE } from '../../../core/services/app-store.service';
import { MessageService } from 'primeng/api';

@Component({
  selector: 'app-admin-clients',
  imports: [
    TableModule, ButtonModule, TagModule, DialogModule, InputTextModule,
    IconFieldModule, InputIconModule, SelectModule, FormsModule, ReactiveFormsModule, CurrencyPipe
  ],
  providers: [MessageService],
  template: `
    <div class="p-4 max-w-7xl mx-auto flex flex-col gap-4">
      <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 class="text-2xl font-bold text-surface-900 dark:text-surface-0 m-0">Mantenedor de Clientes</h1>
          <p class="text-sm text-surface-500 mt-1">Administra el padrón de clientes y su asignación a cobradores.</p>
        </div>
        <button pButton icon="pi pi-plus" label="Nuevo Cliente" (click)="openNewDialog()"></button>
      </div>

      <div class="card bg-surface-0 dark:bg-surface-900 p-4 border-round-xl shadow-sm">
        <div class="flex flex-wrap gap-3 mb-4">
          <p-iconfield styleClass="w-full md:w-auto flex-1 md:flex-none md:w-64">
            <p-inputicon styleClass="pi pi-search" />
            <input pInputText type="text" placeholder="Buscar cliente o DNI..." [(ngModel)]="searchQuery" class="w-full" />
          </p-iconfield>
          <p-select 
            [options]="collectorOptions()" 
            [(ngModel)]="selectedCollector" 
            placeholder="Todos los cobradores"
            optionLabel="label" 
            optionValue="value"
            showClear="true"
            class="w-full md:w-56"
          ></p-select>
        </div>

        <p-table [value]="filteredClients()" [rows]="10" [paginator]="true" responsiveLayout="scroll" styleClass="p-datatable-sm">
          <ng-template #header>
            <tr>
              <th>DNI</th>
              <th>Nombre</th>
              <th>Teléfono</th>
              <th>Cobrador asignado</th>
              <th>Estado Riesgo</th>
              <th>Saldo</th>
              <th>Días Atraso</th>
              <th class="text-center">Acciones</th>
            </tr>
          </ng-template>
          <ng-template #body let-client>
            <tr>
              <td class="font-bold">{{ client.dni }}</td>
              <td [class.text-red-500]="client.risk.isMoroso">
                @if (client.risk.isMoroso) { 🔴 } {{ client.fullName }}
              </td>
              <td>{{ client.phone || '-' }}</td>
              <td>
                <p-tag severity="secondary" [value]="client.collectorName"></p-tag>
              </td>
              <td>
                <p-tag [severity]="getRiskSeverity(client.risk.level)" [value]="client.risk.text"></p-tag>
              </td>
              <td class="font-bold" [class.text-red-500]="client.balance > 0">{{ client.balance | currency: 'PEN' : 'symbol' : '1.2-2' : 'es-PE' }}</td>
              <td>
                <span [class.text-red-500]="client.risk.days > 0">{{ client.risk.days }} días</span>
              </td>
              <td class="text-center">
                <div class="flex gap-2 justify-center">
                  <button pButton icon="pi pi-eye" class="p-button-rounded p-button-text p-button-sm"></button>
                  <button pButton icon="pi pi-pencil" class="p-button-rounded p-button-text p-button-sm p-button-secondary" (click)="openEditDialog(client)"></button>
                </div>
              </td>
            </tr>
          </ng-template>
          <ng-template #empty>
            <tr>
              <td colspan="8" class="text-center p-4">No se encontraron clientes.</td>
            </tr>
          </ng-template>
        </p-table>
      </div>
    </div>

    <p-dialog [(visible)]="dialogVisible" [header]="dialogMode() === 'new' ? 'Nuevo Cliente' : 'Editar Cliente'" [modal]="true" [style]="{width: '500px'}">
      <form [formGroup]="clientForm" (ngSubmit)="saveClient()" class="flex flex-col gap-4 mt-2">
        <div class="flex flex-col gap-1">
          <label for="dni" class="font-medium text-sm">DNI</label>
          <input pInputText id="dni" formControlName="dni" />
        </div>
        <div class="flex flex-col gap-1">
          <label for="fullName" class="font-medium text-sm">Nombre Completo</label>
          <input pInputText id="fullName" formControlName="fullName" />
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div class="flex flex-col gap-1">
            <label for="phone" class="font-medium text-sm">Teléfono</label>
            <input pInputText id="phone" formControlName="phone" />
          </div>
          <div class="flex flex-col gap-1">
            <label for="collectorId" class="font-medium text-sm">Cobrador Asignado</label>
            <p-select id="collectorId" formControlName="collectorId" [options]="collectorList()" optionLabel="fullName" optionValue="id" placeholder="Seleccionar" appendTo="body" class="w-full"></p-select>
          </div>
        </div>
        <div class="flex flex-col gap-1">
          <label for="address" class="font-medium text-sm">Dirección</label>
          <input pInputText id="address" formControlName="address" />
        </div>
        <div class="flex justify-end gap-2 mt-4">
          <button pButton type="button" label="Cancelar" class="p-button-text p-button-secondary" (click)="dialogVisible.set(false)"></button>
          <button pButton type="submit" label="Guardar" [disabled]="clientForm.invalid"></button>
        </div>
      </form>
    </p-dialog>
  `
})
export default class Clients {
  appStore = inject(AppStoreService);
  fb = inject(FormBuilder);
  messageService = inject(MessageService);

  searchQuery = signal('');
  selectedCollector = signal<string | null>(null);

  dialogVisible = signal(false);
  dialogMode = signal<'new' | 'edit'>('new');
  currentClientId = signal<string | null>(null);

  clientForm = this.fb.nonNullable.group({
    dni: ['', [Validators.required]],
    fullName: ['', [Validators.required]],
    phone: [''],
    collectorId: ['', [Validators.required]],
    address: ['', [Validators.required]]
  });

  collectorList = computed(() => this.appStore.profiles().filter(p => p.role === 'COBRADOR'));
  
  collectorOptions = computed(() => {
    return this.collectorList().map(c => ({ label: c.fullName, value: c.id }));
  });

  readonly clientsWithDetails = computed(() => {
    const clients = this.appStore.clients();
    const loans = this.appStore.loans();
    const profiles = this.appStore.profiles();

    return clients.map(client => {
      const activeLoan = loans.find(l => l.clientId === client.id && l.status === 'ACTIVE');
      const collector = profiles.find(p => p.id === client.collectorId);
      
      const riskStatus = this.appStore.getClientRiskStatus(client);

      return {
        ...client,
        collectorName: collector ? collector.fullName : 'Sin asignar',
        balance: activeLoan ? activeLoan.balance : 0,
        risk: { 
          level: riskStatus.level, 
          text: riskStatus.text, 
          isMoroso: riskStatus.isMoroso, 
          days: riskStatus.days 
        }
      };
    });
  });

  readonly filteredClients = computed(() => {
    let result = this.clientsWithDetails();
    const query = this.searchQuery().toLowerCase();
    const colFilter = this.selectedCollector();

    if (query) {
      result = result.filter(c => c.fullName.toLowerCase().includes(query) || c.dni.includes(query));
    }
    if (colFilter) {
      result = result.filter(c => c.collectorId === colFilter);
    }
    return result;
  });

  getRiskSeverity(level: string): 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast' {
    switch (level) {
      case 'green': return 'success';
      case 'yellow': return 'warn';
      case 'orange': return 'warn';
      case 'red': return 'danger';
      default: return 'secondary';
    }
  }

  openNewDialog() {
    this.dialogMode.set('new');
    this.currentClientId.set(null);
    this.clientForm.reset();
    this.dialogVisible.set(true);
  }

  openEditDialog(client: any) {
    this.dialogMode.set('edit');
    this.currentClientId.set(client.id);
    this.clientForm.patchValue({
      dni: client.dni,
      fullName: client.fullName,
      phone: client.phone || '',
      collectorId: client.collectorId,
      address: client.address
    });
    this.dialogVisible.set(true);
  }

  saveClient() {
    if (this.clientForm.invalid) return;
    this.messageService.add({ severity: 'success', summary: 'Éxito', detail: 'Cliente guardado correctamente' });
    this.dialogVisible.set(false);
  }
}
