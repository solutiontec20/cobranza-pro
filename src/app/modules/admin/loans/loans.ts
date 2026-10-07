import { Component, computed, inject, signal, effect } from '@angular/core';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { InputNumberModule } from 'primeng/inputnumber';
import { DatePickerModule } from 'primeng/datepicker';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { AppStoreService, SYSTEM_DATE } from '../../../core/services/app-store.service';
import { MessageService } from 'primeng/api';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from '../../auth/auth.service';

@Component({
  selector: 'app-admin-loans',
  imports: [
    TableModule, ButtonModule, TagModule, DialogModule, SelectModule,
    InputNumberModule, DatePickerModule, FormsModule, ReactiveFormsModule, CurrencyPipe
  ],
  providers: [MessageService],
  template: `
    <div class="p-4 max-w-7xl mx-auto flex flex-col gap-4">
      <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 class="text-2xl font-bold text-surface-900 dark:text-surface-0 m-0">Administración de Préstamos</h1>
          <p class="text-sm text-surface-500 mt-1">Creación de créditos y seguimiento.</p>
        </div>
        <p-button icon="pi pi-plus" label="Nuevo Préstamo" (click)="openNewDialog()"></p-button>
      </div>

      <div class="card bg-surface-0 dark:bg-surface-900 p-4 border-round-xl shadow-sm">
        <p-table [value]="loansWithDetails()" [rows]="10" [paginator]="true" responsiveLayout="scroll" styleClass="p-datatable-sm">
          <ng-template #header>
            <tr>
              <th>Cliente</th>
              <th>Cobrador</th>
              <th>Capital</th>
              <th>Tasa</th>
              <th>Total Pagar</th>
              <th>Cuota</th>
              <th>Frecuencia</th>
              <th>Saldo</th>
              <th>Estado</th>
              <th class="text-center">Acciones</th>
            </tr>
          </ng-template>
          <ng-template #body let-loan>
            <tr>
              <td class="font-bold">{{ loan.clientName }}</td>
              <td>{{ loan.collectorName }}</td>
              <td class="font-bold">{{ loan.principal | currency: 'PEN' : 'symbol' : '1.2-2' : 'es-PE' }}</td>
              <td>{{ loan.interestRate }}%</td>
              <td class="font-bold">{{ loan.totalAmount | currency: 'PEN' : 'symbol' : '1.2-2' : 'es-PE' }}</td>
              <td class="text-primary font-bold">{{ loan.installmentAmount | currency: 'PEN' : 'symbol' : '1.2-2' : 'es-PE' }}</td>
              <td><p-tag severity="secondary" [value]="loan.frequency"></p-tag></td>
              <td class="font-bold" [class.text-red-500]="loan.balance > 0">{{ loan.balance | currency: 'PEN' : 'symbol' : '1.2-2' : 'es-PE' }}</td>
              <td>
                <p-tag [severity]="loan.status === 'ACTIVE' ? 'success' : 'secondary'" [value]="loan.status"></p-tag>
              </td>
              <td class="text-center">
                <p-button label="Cronograma" variant="outlined" size="small"></p-button>
              </td>
            </tr>
          </ng-template>
          <ng-template #empty>
            <tr>
              <td colspan="10" class="text-center p-4">No hay préstamos registrados.</td>
            </tr>
          </ng-template>
        </p-table>
      </div>
    </div>

    <p-dialog [(visible)]="dialogVisible" header="Nuevo Préstamo" [modal]="true" [style]="{width: '550px'}">
      <form [formGroup]="loanForm" (ngSubmit)="saveLoan()" class="flex flex-col gap-4 mt-2">
        <div class="flex flex-col gap-1">
          <label for="clientId" class="font-medium text-sm">Cliente</label>
          <p-select id="clientId" formControlName="clientId" [options]="clientOptions()" optionLabel="label" optionValue="value" placeholder="Seleccionar cliente" appendTo="body" class="w-full" [filter]="true" filterBy="label"></p-select>
        </div>
        
        <div class="grid grid-cols-2 gap-4">
          <div class="flex flex-col gap-1">
            <label for="principal" class="font-medium text-sm">Monto Capital (S/)</label>
            <p-inputnumber id="principal" formControlName="principal" mode="currency" currency="PEN" locale="es-PE" class="w-full"></p-inputnumber>
          </div>
          <div class="flex flex-col gap-1">
            <label for="interestRate" class="font-medium text-sm">Tasa de Interés (%)</label>
            <p-inputnumber id="interestRate" formControlName="interestRate" suffix="%" class="w-full"></p-inputnumber>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div class="flex flex-col gap-1">
            <label for="frequency" class="font-medium text-sm">Frecuencia</label>
            <p-select id="frequency" formControlName="frequency" [options]="frequencyOptions" appendTo="body" class="w-full"></p-select>
          </div>
          <div class="flex flex-col gap-1">
            <label for="installmentsCount" class="font-medium text-sm">N° de Cuotas</label>
            <p-inputnumber id="installmentsCount" formControlName="installmentsCount" class="w-full"></p-inputnumber>
          </div>
        </div>
        
        <div class="flex flex-col gap-1">
          <label for="startDate" class="font-medium text-sm">Fecha de Inicio</label>
          <p-datepicker id="startDate" formControlName="startDate" dateFormat="dd/mm/yy" appendTo="body" class="w-full"></p-datepicker>
        </div>

        <!-- Resumen -->
        <div class="mt-4 p-4 bg-surface-50 dark:bg-surface-800 border-round-lg grid grid-cols-2 gap-4 text-sm">
          <div>
            <span class="text-surface-500 block">Total a Pagar:</span>
            <span class="font-bold text-lg">{{ computedTotal() | currency: 'PEN' : 'symbol' : '1.2-2' : 'es-PE' }}</span>
          </div>
          <div>
            <span class="text-surface-500 block">Valor de Cuota:</span>
            <span class="font-bold text-lg text-primary">{{ computedInstallment() | currency: 'PEN' : 'symbol' : '1.2-2' : 'es-PE' }}</span>
          </div>
        </div>

        <div class="flex justify-end gap-2 mt-4">
          <p-button type="button" label="Cancelar" severity="secondary" variant="text" (click)="dialogVisible.set(false)"></p-button>
          <p-button type="submit" label="Crear Préstamo" [disabled]="loanForm.invalid"></p-button>
        </div>
      </form>
    </p-dialog>
  `
})
export default class Loans {
  appStore = inject(AppStoreService);
  fb = inject(FormBuilder);
  messageService = inject(MessageService);
  authService = inject(AuthService);

  dialogVisible = signal(false);

  frequencyOptions = [
    { label: 'Diario', value: 'DIARIO' },
    { label: 'Semanal', value: 'SEMANAL' },
    { label: 'Mensual', value: 'MENSUAL' }
  ];

  loanForm = this.fb.nonNullable.group({
    clientId: ['', [Validators.required]],
    principal: [100, [Validators.required, Validators.min(10)]],
    interestRate: [20, [Validators.required, Validators.min(1)]],
    frequency: ['DIARIO', [Validators.required]],
    installmentsCount: [24, [Validators.required, Validators.min(1)]],
    startDate: [new Date(), [Validators.required]]
  });

  // Watch form changes to compute totals
  formChanges = toSignal(this.loanForm.valueChanges, { initialValue: this.loanForm.value });

  computedTotal = computed(() => {
    const vals = this.formChanges();
    const principal = vals.principal || 0;
    const rate = vals.interestRate || 0;
    return principal + (principal * (rate / 100));
  });

  computedInstallment = computed(() => {
    const vals = this.formChanges();
    const total = this.computedTotal();
    const count = vals.installmentsCount || 1;
    return total / count;
  });

  clientOptions = computed(() => {
    return this.appStore.clients()
      .filter(c => c.active)
      .map(c => ({ label: `${c.dni} - ${c.fullName}`, value: c.id }));
  });

  readonly loansWithDetails = computed(() => {
    const loans = this.appStore.loans();
    const clients = this.appStore.clients();
    const profiles = this.appStore.profiles();

    return loans.map(loan => {
      const client = clients.find(c => c.id === loan.clientId);
      const collector = profiles.find(p => p.id === loan.collectorId);
      
      return {
        ...loan,
        clientName: client ? client.fullName : loan.clientId,
        collectorName: collector ? collector.fullName : 'Sin asignar'
      };
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  });

  openNewDialog() {
    this.loanForm.reset({
      clientId: '',
      principal: 100,
      interestRate: 20,
      frequency: 'DIARIO',
      installmentsCount: 24,
      startDate: new Date()
    });
    this.dialogVisible.set(true);
  }

  saveLoan() {
    if (this.loanForm.invalid) return;

    const val = this.loanForm.getRawValue();
    const userId = this.authService.currentUser()?.id;

    if (!userId) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No hay usuario autenticado.' });
      return;
    }

    try {
      this.appStore.createLoan({
        clientId: val.clientId,
        principal: val.principal,
        interestRate: val.interestRate,
        frequency: val.frequency as any,
        numberOfInstallments: val.installmentsCount,
        startDate: val.startDate.toISOString().split('T')[0]
      }, userId);

      this.messageService.add({ severity: 'success', summary: 'Éxito', detail: 'Préstamo creado correctamente' });
      this.dialogVisible.set(false);
    } catch (e: any) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: e.message || 'Error al crear préstamo' });
    }
  }
}
