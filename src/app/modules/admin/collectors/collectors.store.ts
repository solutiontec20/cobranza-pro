import { computed, inject, Injectable, signal } from '@angular/core';
import { AppError } from '../../../core/errors/app-error';
import {
  Collector,
  CreateCollectorInput,
  ResetCollectorPinInput,
  ResetCollectorPinResult,
  SetCollectorActiveInput,
  UpdateCollectorInput,
} from '../../../core/models/collector.model';
import { COLLECTOR_REPOSITORY } from '../../../core/repositories/collector.repository';

@Injectable()
export class CollectorsStore {
  private readonly repository = inject(COLLECTOR_REPOSITORY);

  readonly collectors = signal<Collector[]>([]);
  readonly query = signal('');
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly creating = signal(false);
  readonly updatingCollectorId = signal<string | null>(null);
  readonly editingCollectorId = signal<string | null>(null);
  readonly resettingCollectorId = signal<string | null>(null);

  readonly filteredCollectors = computed(() => {
    const query = this.normalize(this.query());
    if (!query) return this.collectors();

    return this.collectors().filter((collector) =>
      [collector.fullName, collector.dni, collector.phone ?? '']
        .map((value) => this.normalize(value))
        .some((value) => value.includes(query)),
    );
  });

  readonly summary = computed(() => {
    const collectors = this.collectors();
    return {
      total: collectors.length,
      active: collectors.filter((collector) => collector.active).length,
      inactive: collectors.filter((collector) => !collector.active).length,
      assignedCustomers: collectors.reduce(
        (total, collector) => total + collector.activeCustomerCount,
        0,
      ),
    };
  });

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      this.collectors.set(await this.repository.list());
    } catch (error) {
      this.error.set(this.messageFrom(error, 'No se pudo cargar la lista de cobradores.'));
    } finally {
      this.loading.set(false);
    }
  }

  async create(input: CreateCollectorInput): Promise<boolean> {
    this.creating.set(true);
    this.error.set(null);

    try {
      const collector = await this.repository.create(input);
      this.collectors.update((collectors) =>
        [...collectors, collector].sort((left, right) =>
          left.fullName.localeCompare(right.fullName, 'es-PE'),
        ),
      );
      return true;
    } catch (error) {
      this.error.set(this.messageFrom(error, 'No se pudo crear el cobrador.'));
      return false;
    } finally {
      this.creating.set(false);
    }
  }

  async setActive(input: SetCollectorActiveInput): Promise<boolean> {
    this.updatingCollectorId.set(input.collectorId);
    this.error.set(null);

    try {
      const updated = await this.repository.setActive(input);
      this.collectors.update((collectors) =>
        collectors.map((collector) => (collector.id === updated.id ? updated : collector)),
      );
      return true;
    } catch (error) {
      this.error.set(this.messageFrom(error, 'No se pudo cambiar el estado del cobrador.'));
      return false;
    } finally {
      this.updatingCollectorId.set(null);
    }
  }

  async update(input: UpdateCollectorInput): Promise<boolean> {
    this.editingCollectorId.set(input.collectorId);
    this.error.set(null);

    try {
      const updated = await this.repository.update(input);
      this.collectors.update((collectors) =>
        collectors
          .map((collector) => (collector.id === updated.id ? updated : collector))
          .sort((left, right) => left.fullName.localeCompare(right.fullName, 'es-PE')),
      );
      return true;
    } catch (error) {
      this.error.set(this.messageFrom(error, 'No se pudo editar el cobrador.'));
      return false;
    } finally {
      this.editingCollectorId.set(null);
    }
  }

  async resetPin(input: ResetCollectorPinInput): Promise<ResetCollectorPinResult | null> {
    this.resettingCollectorId.set(input.collectorId);
    this.error.set(null);

    try {
      return await this.repository.resetPin(input);
    } catch (error) {
      this.error.set(this.messageFrom(error, 'No se pudo restablecer el PIN.'));
      return null;
    } finally {
      this.resettingCollectorId.set(null);
    }
  }

  clearError(): void {
    this.error.set(null);
  }

  private messageFrom(error: unknown, fallback: string): string {
    const appError = AppError.from(error);
    return appError.message || fallback;
  }

  private normalize(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('es-PE')
      .trim();
  }
}
