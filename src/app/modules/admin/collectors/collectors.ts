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
import { AuthService } from '../../auth/auth.service';
import { CollectorsStore } from './collectors.store';

const EMPTY_CREATE_MODEL = { fullName: '', dni: '', phone: '', temporaryPin: '' };
const EMPTY_RESET_MODEL = { reason: '' };

@Component({
  selector: 'app-collectors',
  imports: [
    ButtonModule,
    DialogModule,
    FormField,
    InputTextModule,
    MessageModule,
    SkeletonModule,
    TagModule,
  ],
  template: `
    <main
      class="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 sm:p-6"
      aria-labelledby="collectors-title"
    >
      <header class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p class="mb-1 text-sm font-medium text-primary">Equipo de cobranza</p>
          <h1 id="collectors-title" class="text-2xl font-bold text-color sm:text-3xl">
            Cobradores
          </h1>
          <p class="mt-1 max-w-2xl text-sm text-muted-color">
            Consultá la cartera asignada y administrá el acceso operativo del equipo.
          </p>
        </div>
        @if (authService.isAdmin()) {
          <p-button label="Nuevo cobrador" icon="pi pi-user-plus" (onClick)="openCreateDialog()" />
        }
      </header>

      <section class="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Resumen de cobradores">
        <article
          class="rounded-xl border border-surface bg-surface-0 p-4 shadow-sm dark:bg-surface-900"
        >
          <p class="text-sm text-muted-color">Total</p>
          <p class="mt-2 text-2xl font-semibold text-color">{{ store.summary().total }}</p>
        </article>
        <article
          class="rounded-xl border border-surface bg-surface-0 p-4 shadow-sm dark:bg-surface-900"
        >
          <p class="text-sm text-muted-color">Activos</p>
          <p class="mt-2 text-2xl font-semibold text-green-600 dark:text-green-400">
            {{ store.summary().active }}
          </p>
        </article>
        <article
          class="rounded-xl border border-surface bg-surface-0 p-4 shadow-sm dark:bg-surface-900"
        >
          <p class="text-sm text-muted-color">Inactivos</p>
          <p class="mt-2 text-2xl font-semibold text-color">{{ store.summary().inactive }}</p>
        </article>
        <article
          class="rounded-xl border border-surface bg-surface-0 p-4 shadow-sm dark:bg-surface-900"
        >
          <p class="text-sm text-muted-color">Clientes activos</p>
          <p class="mt-2 text-2xl font-semibold text-color">
            {{ store.summary().assignedCustomers }}
          </p>
        </article>
      </section>

      <section class="rounded-xl border border-surface bg-surface-0 shadow-sm dark:bg-surface-900">
        <div
          class="flex flex-col gap-3 border-b border-surface p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <label class="relative block w-full sm:max-w-md">
            <span class="sr-only">Buscar cobrador</span>
            <i
              class="pi pi-search absolute left-3 top-1/2 -translate-y-1/2 text-muted-color"
              aria-hidden="true"
            ></i>
            <input
              pInputText
              type="search"
              class="w-full pl-10"
              placeholder="Buscar por nombre, DNI o teléfono"
              [value]="store.query()"
              (input)="store.query.set(searchValue($event))"
            />
          </label>
          <p class="text-sm text-muted-color" aria-live="polite">
            {{ store.filteredCollectors().length }} resultado(s)
          </p>
        </div>

        @if (store.error()) {
          <div class="p-4" role="alert">
            <p-message severity="error" styleClass="w-full">{{ store.error() }}</p-message>
          </div>
        }

        @if (store.loading()) {
          <div class="space-y-3 p-4" aria-label="Cargando cobradores">
            @for (item of loadingRows; track item) {
              <p-skeleton height="5rem" borderRadius="0.75rem" />
            }
          </div>
        } @else if (store.collectors().length === 0) {
          <div class="flex flex-col items-center px-6 py-14 text-center">
            <i class="pi pi-users mb-4 text-4xl text-muted-color" aria-hidden="true"></i>
            <h2 class="text-lg font-semibold text-color">Todavía no hay cobradores</h2>
            <p class="mt-1 max-w-md text-sm text-muted-color">
              @if (authService.isAdmin()) {
                Creá el primer acceso para empezar a asignar carteras.
              } @else {
                Un administrador debe crear los accesos del equipo.
              }
            </p>
          </div>
        } @else if (store.filteredCollectors().length === 0) {
          <div class="flex flex-col items-center px-6 py-14 text-center">
            <i class="pi pi-search mb-4 text-3xl text-muted-color" aria-hidden="true"></i>
            <h2 class="text-lg font-semibold text-color">No encontramos coincidencias</h2>
            <p class="mt-1 text-sm text-muted-color">Probá con otro nombre, DNI o teléfono.</p>
          </div>
        } @else {
          <div class="divide-y divide-surface lg:hidden">
            @for (collector of store.filteredCollectors(); track collector.id) {
              <article class="flex flex-col gap-4 p-4">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <h2 class="truncate font-semibold text-color">{{ collector.fullName }}</h2>
                    <p class="mt-1 text-sm text-muted-color">DNI {{ collector.dni }}</p>
                  </div>
                  <p-tag
                    [severity]="collector.active ? 'success' : 'secondary'"
                    [value]="collector.active ? 'Activo' : 'Inactivo'"
                  />
                </div>
                <dl class="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt class="text-muted-color">Teléfono</dt>
                    <dd class="mt-1 font-medium text-color">
                      {{ collector.phone ?? 'No registrado' }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-muted-color">Clientes activos</dt>
                    <dd class="mt-1 font-medium text-color">{{ collector.activeCustomerCount }}</dd>
                  </div>
                </dl>
                @if (authService.isAdmin()) {
                  <div class="grid gap-2 sm:grid-cols-2">
                    <p-button
                      fluid
                      size="small"
                      severity="secondary"
                      variant="outlined"
                      label="Restablecer PIN"
                      icon="pi pi-key"
                      [disabled]="!collector.active"
                      [loading]="store.resettingCollectorId() === collector.id"
                      (onClick)="openResetDialog(collector)"
                    />
                    <p-button
                      fluid
                      size="small"
                      [severity]="collector.active ? 'danger' : 'success'"
                      variant="outlined"
                      [label]="collector.active ? 'Desactivar' : 'Activar'"
                      [icon]="collector.active ? 'pi pi-user-minus' : 'pi pi-user-plus'"
                      [loading]="store.updatingCollectorId() === collector.id"
                      (onClick)="openStatusDialog(collector)"
                    />
                  </div>
                }
              </article>
            }
          </div>

          <div class="hidden overflow-x-auto lg:block">
            <table class="w-full border-collapse text-left">
              <thead>
                <tr class="border-b border-surface text-sm text-muted-color">
                  <th class="px-5 py-3 font-medium">Cobrador</th>
                  <th class="px-5 py-3 font-medium">Contacto</th>
                  <th class="px-5 py-3 font-medium">Clientes activos</th>
                  <th class="px-5 py-3 font-medium">Registro</th>
                  <th class="px-5 py-3 font-medium">Estado</th>
                  @if (authService.isAdmin()) {
                    <th class="px-5 py-3 text-right font-medium">
                      <span class="sr-only">Acciones</span>
                    </th>
                  }
                </tr>
              </thead>
              <tbody class="divide-y divide-surface">
                @for (collector of store.filteredCollectors(); track collector.id) {
                  <tr>
                    <td class="px-5 py-4">
                      <p class="font-semibold text-color">{{ collector.fullName }}</p>
                      <p class="mt-1 text-sm text-muted-color">DNI {{ collector.dni }}</p>
                    </td>
                    <td class="px-5 py-4 text-sm text-color">
                      {{ collector.phone ?? 'No registrado' }}
                    </td>
                    <td class="px-5 py-4 text-sm font-medium text-color">
                      {{ collector.activeCustomerCount }}
                    </td>
                    <td class="px-5 py-4 text-sm text-muted-color">
                      {{ formatDate(collector.createdAt) }}
                    </td>
                    <td class="px-5 py-4">
                      <p-tag
                        [severity]="collector.active ? 'success' : 'secondary'"
                        [value]="collector.active ? 'Activo' : 'Inactivo'"
                      />
                    </td>
                    @if (authService.isAdmin()) {
                      <td class="px-5 py-4">
                        <div class="flex justify-end gap-2">
                          <p-button
                            size="small"
                            severity="secondary"
                            variant="outlined"
                            label="Restablecer PIN"
                            icon="pi pi-key"
                            [disabled]="!collector.active"
                            [loading]="store.resettingCollectorId() === collector.id"
                            (onClick)="openResetDialog(collector)"
                          />
                        <p-button
                          size="small"
                          [severity]="collector.active ? 'danger' : 'success'"
                          variant="outlined"
                          [label]="collector.active ? 'Desactivar' : 'Activar'"
                          [loading]="store.updatingCollectorId() === collector.id"
                          (onClick)="openStatusDialog(collector)"
                        />
                        </div>
                      </td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </section>
    </main>

    <p-dialog
      header="Nuevo cobrador"
      [modal]="true"
      [visible]="createVisible()"
      (visibleChange)="createVisible.set($event)"
      styleClass="w-[calc(100vw-2rem)] max-w-xl"
    >
      <form class="flex flex-col gap-4" (submit)="createCollector(); $event.preventDefault()">
        <div>
          <label for="collector-name" class="mb-2 block text-sm font-medium text-color"
            >Nombre completo</label
          >
          <input
            id="collector-name"
            pInputText
            class="w-full"
            autocomplete="name"
            [formField]="createForm.fullName"
          />
          @if (createForm.fullName().touched() && createForm.fullName().invalid()) {
            <small class="mt-1 block text-red-600">{{
              createForm.fullName().errors()[0]?.message
            }}</small>
          }
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <label for="collector-dni" class="mb-2 block text-sm font-medium text-color">DNI</label>
            <input
              id="collector-dni"
              pInputText
              class="w-full"
              inputmode="numeric"
              autocomplete="off"
              [formField]="createForm.dni"
            />
            @if (createForm.dni().touched() && createForm.dni().invalid()) {
              <small class="mt-1 block text-red-600">{{
                createForm.dni().errors()[0]?.message
              }}</small>
            }
          </div>
          <div>
            <label for="collector-phone" class="mb-2 block text-sm font-medium text-color"
              >Teléfono (opcional)</label
            >
            <input
              id="collector-phone"
              pInputText
              class="w-full"
              inputmode="tel"
              autocomplete="tel"
              [formField]="createForm.phone"
            />
            @if (createForm.phone().touched() && createForm.phone().invalid()) {
              <small class="mt-1 block text-red-600">{{
                createForm.phone().errors()[0]?.message
              }}</small>
            }
          </div>
        </div>
        <div>
          <label for="collector-pin" class="mb-2 block text-sm font-medium text-color"
            >PIN temporal</label
          >
          <input
            id="collector-pin"
            pInputText
            type="password"
            class="w-full"
            inputmode="numeric"
            autocomplete="new-password"
            [formField]="createForm.temporaryPin"
          />
          <small class="mt-1 block text-muted-color">Debe tener exactamente 6 dígitos.</small>
          @if (createForm.temporaryPin().touched() && createForm.temporaryPin().invalid()) {
            <small class="mt-1 block text-red-600">{{
              createForm.temporaryPin().errors()[0]?.message
            }}</small>
          }
        </div>
        <div class="mt-2 flex justify-end gap-2">
          <p-button
            type="button"
            label="Cancelar"
            severity="secondary"
            variant="text"
            (onClick)="createVisible.set(false)"
          />
          <p-button
            type="submit"
            label="Crear cobrador"
            icon="pi pi-user-plus"
            [loading]="store.creating()"
            [disabled]="createForm().invalid()"
          />
        </div>
      </form>
    </p-dialog>

    <p-dialog
      header="Restablecer PIN"
      [modal]="true"
      [visible]="resetVisible()"
      (visibleChange)="setResetVisible($event)"
      styleClass="w-[calc(100vw-2rem)] max-w-lg"
    >
      @if (selectedCollector(); as collector) {
        @if (resetResult(); as result) {
          <div class="flex flex-col gap-4" aria-live="polite">
            <p-message severity="success" styleClass="w-full">
              El PIN de {{ result.collectorName }} fue restablecido.
            </p-message>
            <div class="rounded-xl border border-primary-200 bg-primary-50 p-5 text-center dark:border-primary-800 dark:bg-primary-950/30">
              <p class="text-sm text-muted-color">PIN temporal — se muestra una sola vez</p>
              <p class="mt-2 font-mono text-3xl font-bold tracking-[0.35em] text-color">
                {{ result.temporaryPin }}
              </p>
            </div>
            <p class="text-sm text-muted-color">
              Entregalo al cobrador por un canal seguro. Deberá cambiarlo al iniciar sesión.
            </p>
            <div class="flex justify-end">
              <p-button label="Cerrar" (onClick)="setResetVisible(false)" />
            </div>
          </div>
        } @else {
          <form class="flex flex-col gap-4" (submit)="resetPin(); $event.preventDefault()">
            <p class="text-sm text-muted-color">
              Se invalidará el acceso anterior de
              <strong class="text-color">{{ collector.fullName }}</strong> y se generará un PIN temporal.
            </p>
            @if (!collector.active) {
              <p-message severity="warn" styleClass="w-full">
                Activá al cobrador antes de restablecer su PIN.
              </p-message>
            }
            <div>
              <label for="reset-pin-reason" class="mb-2 block text-sm font-medium text-color">Motivo</label>
              <textarea
                id="reset-pin-reason"
                pInputText
                rows="3"
                class="w-full resize-y"
                [formField]="resetForm.reason"
              ></textarea>
              @if (resetForm.reason().touched() && resetForm.reason().invalid()) {
                <small class="mt-1 block text-red-600">{{ resetForm.reason().errors()[0]?.message }}</small>
              }
            </div>
            <div class="flex justify-end gap-2">
              <p-button
                type="button"
                label="Cancelar"
                severity="secondary"
                variant="text"
                (onClick)="setResetVisible(false)"
              />
              <p-button
                type="submit"
                label="Generar PIN temporal"
                icon="pi pi-key"
                [loading]="store.resettingCollectorId() === collector.id"
                [disabled]="resetForm().invalid() || !collector.active"
              />
            </div>
          </form>
        }
      }
    </p-dialog>

    <p-dialog
      [header]="selectedCollector()?.active ? 'Desactivar cobrador' : 'Activar cobrador'"
      [modal]="true"
      [visible]="statusVisible()"
      (visibleChange)="statusVisible.set($event)"
      styleClass="w-[calc(100vw-2rem)] max-w-lg"
    >
      @if (selectedCollector(); as collector) {
        <form class="flex flex-col gap-4" (submit)="changeStatus(); $event.preventDefault()">
          <p class="text-sm text-muted-color">
            Vas a {{ collector.active ? 'desactivar' : 'activar' }} el acceso de
            <strong class="text-color">{{ collector.fullName }}</strong
            >.
          </p>
          @if (collector.active && collector.activeCustomerCount > 0) {
            <p-message severity="warn" styleClass="w-full">
              No se puede desactivar mientras tenga clientes activos. Reasigná la cartera primero.
            </p-message>
          }
          <div>
            <label for="status-reason" class="mb-2 block text-sm font-medium text-color"
              >Motivo</label
            >
            <textarea
              id="status-reason"
              pInputText
              rows="3"
              class="w-full resize-y"
              [formField]="statusForm.reason"
            ></textarea>
            @if (statusForm.reason().touched() && statusForm.reason().invalid()) {
              <small class="mt-1 block text-red-600">{{
                statusForm.reason().errors()[0]?.message
              }}</small>
            }
          </div>
          <div class="flex justify-end gap-2">
            <p-button
              type="button"
              label="Cancelar"
              severity="secondary"
              variant="text"
              (onClick)="statusVisible.set(false)"
            />
            <p-button
              type="submit"
              [label]="collector.active ? 'Desactivar' : 'Activar'"
              [severity]="collector.active ? 'danger' : 'success'"
              [loading]="store.updatingCollectorId() === collector.id"
              [disabled]="
                statusForm().invalid() || (collector.active && collector.activeCustomerCount > 0)
              "
            />
          </div>
        </form>
      }
    </p-dialog>
  `,
})
export default class Collectors {
  protected readonly store = inject(CollectorsStore);
  protected readonly authService = inject(AuthService);
  private readonly messageService = inject(MessageService);
  protected readonly loadingRows = [1, 2, 3];
  protected readonly createVisible = signal(false);
  protected readonly statusVisible = signal(false);
  protected readonly resetVisible = signal(false);
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

  protected formatDate(value: string): string {
    return new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium' }).format(new Date(value));
  }
}
