import { computed, inject, Injectable, signal } from '@angular/core';
import { AppError } from '../../../core/errors/app-error';
import { normalizeSearchText } from '../../../core/calculations/text';
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

  private readonly collectorsState = signal<Collector[]>([]);
  private readonly queryState = signal('');
  private readonly loadingState = signal(false);
  private readonly errorState = signal<string | null>(null);
  private readonly creatingState = signal(false);
  private readonly updatingCollectorIdState = signal<string | null>(null);
  private readonly editingCollectorIdState = signal<string | null>(null);
  private readonly resettingCollectorIdState = signal<string | null>(null);

  readonly collectors = this.collectorsState.asReadonly();
  readonly query = this.queryState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly creating = this.creatingState.asReadonly();
  readonly updatingCollectorId = this.updatingCollectorIdState.asReadonly();
  readonly editingCollectorId = this.editingCollectorIdState.asReadonly();
  readonly resettingCollectorId = this.resettingCollectorIdState.asReadonly();

  readonly filteredCollectors = computed(() => {
    const query = normalizeSearchText(this.query());
    if (!query) return this.collectors();

    return this.collectors().filter((collector) =>
      [collector.fullName, collector.dni, collector.phone ?? '']
        .map(normalizeSearchText)
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
    this.loadingState.set(true);
    this.errorState.set(null);

    try {
      this.collectorsState.set(await this.repository.list());
    } catch (error) {
      this.errorState.set(this.messageFrom(error, 'No se pudo cargar la lista de cobradores.'));
    } finally {
      this.loadingState.set(false);
    }
  }

  async create(input: CreateCollectorInput): Promise<boolean> {
    this.creatingState.set(true);
    this.errorState.set(null);

    try {
      const collector = await this.repository.create(input);
      this.collectorsState.update((collectors) =>
        [...collectors, collector].sort((left, right) =>
          left.fullName.localeCompare(right.fullName, 'es-PE'),
        ),
      );
      return true;
    } catch (error) {
      this.errorState.set(this.messageFrom(error, 'No se pudo crear el cobrador.'));
      return false;
    } finally {
      this.creatingState.set(false);
    }
  }

  async setActive(input: SetCollectorActiveInput): Promise<boolean> {
    this.updatingCollectorIdState.set(input.collectorId);
    this.errorState.set(null);

    try {
      const updated = await this.repository.setActive(input);
      this.collectorsState.update((collectors) =>
        collectors.map((collector) => (collector.id === updated.id ? updated : collector)),
      );
      return true;
    } catch (error) {
      this.errorState.set(this.messageFrom(error, 'No se pudo cambiar el estado del cobrador.'));
      return false;
    } finally {
      this.updatingCollectorIdState.set(null);
    }
  }

  async update(input: UpdateCollectorInput): Promise<boolean> {
    this.editingCollectorIdState.set(input.collectorId);
    this.errorState.set(null);

    try {
      const updated = await this.repository.update(input);
      this.collectorsState.update((collectors) =>
        collectors
          .map((collector) => (collector.id === updated.id ? updated : collector))
          .sort((left, right) => left.fullName.localeCompare(right.fullName, 'es-PE')),
      );
      return true;
    } catch (error) {
      this.errorState.set(this.messageFrom(error, 'No se pudo editar el cobrador.'));
      return false;
    } finally {
      this.editingCollectorIdState.set(null);
    }
  }

  async resetPin(input: ResetCollectorPinInput): Promise<ResetCollectorPinResult | null> {
    this.resettingCollectorIdState.set(input.collectorId);
    this.errorState.set(null);

    try {
      return await this.repository.resetPin(input);
    } catch (error) {
      this.errorState.set(this.messageFrom(error, 'No se pudo restablecer el PIN.'));
      return null;
    } finally {
      this.resettingCollectorIdState.set(null);
    }
  }

  setQuery(query: string): void {
    this.queryState.set(query);
  }

  clearError(): void {
    this.errorState.set(null);
  }

  private messageFrom(error: unknown, fallback: string): string {
    const appError = AppError.from(error);
    return appError.message || fallback;
  }
}
