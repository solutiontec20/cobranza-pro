import { computed, inject, Injectable, signal } from '@angular/core';
import { AppError } from '../../../core/errors/app-error';
import {
  ClientCollectorOption,
  ClientListItem,
  CreateClientInput,
  UpdateClientInput,
} from '../../../core/models/client.model';
import { CLIENT_REPOSITORY } from '../../../core/repositories/client.repository';

@Injectable()
export class ClientsStore {
  private readonly repository = inject(CLIENT_REPOSITORY);
  private pageAbortController: AbortController | null = null;

  readonly clients = signal<ClientListItem[]>([]);
  readonly collectors = signal<ClientCollectorOption[]>([]);
  readonly pageIndex = signal(0);
  readonly pageSize = signal(10);
  readonly totalRecords = signal(0);
  readonly search = signal('');
  readonly collectorFilter = signal<string | null>(null);
  private readonly pageLoading = signal(false);
  private readonly collectorsLoading = signal(false);
  readonly loading = computed(() => this.pageLoading() || this.collectorsLoading());
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly firstRecord = computed(() =>
    this.totalRecords() === 0 ? 0 : this.pageIndex() * this.pageSize() + 1,
  );
  readonly lastRecord = computed(() =>
    Math.min((this.pageIndex() + 1) * this.pageSize(), this.totalRecords()),
  );

  async initialize(collectorId: string | null = null): Promise<void> {
    this.collectorFilter.set(collectorId);
    await Promise.all([this.loadCollectors(), this.loadPage()]);
  }

  async loadPage(): Promise<void> {
    this.pageAbortController?.abort();
    const controller = new AbortController();
    this.pageAbortController = controller;
    this.pageLoading.set(true);
    this.error.set(null);

    try {
      const page = await this.repository.list(
        {
          pageIndex: this.pageIndex(),
          pageSize: this.pageSize(),
          search: this.search(),
          collectorId: this.collectorFilter(),
        },
        controller.signal,
      );

      if (controller.signal.aborted) return;

      this.clients.set(page.items);
      this.totalRecords.set(page.total);
    } catch (error) {
      if (controller.signal.aborted) return;
      this.clients.set([]);
      this.totalRecords.set(0);
      this.error.set(this.messageFrom(error, 'No se pudo cargar la gestión de clientes.'));
    } finally {
      if (this.pageAbortController === controller) {
        this.pageLoading.set(false);
      }
    }
  }

  async setSearch(search: string): Promise<void> {
    const normalized = search.trim();
    if (normalized === this.search()) return;
    this.search.set(normalized);
    this.pageIndex.set(0);
    await this.loadPage();
  }

  async setCollectorFilter(collectorId: string | null): Promise<void> {
    if (collectorId === this.collectorFilter()) return;
    this.collectorFilter.set(collectorId);
    this.pageIndex.set(0);
    await this.loadPage();
  }

  async setPage(first: number, rows: number): Promise<void> {
    const pageSize = Math.min(100, Math.max(1, rows));
    const pageIndex = Math.max(0, Math.floor(first / pageSize));
    if (pageSize === this.pageSize() && pageIndex === this.pageIndex()) return;
    this.pageSize.set(pageSize);
    this.pageIndex.set(pageIndex);
    await this.loadPage();
  }

  async create(input: CreateClientInput): Promise<boolean> {
    this.saving.set(true);
    this.error.set(null);

    try {
      await this.repository.create(input);
      this.pageIndex.set(0);
      await this.loadPage();
      return this.error() === null;
    } catch (error) {
      this.error.set(this.messageFrom(error, 'No se pudo registrar el cliente.'));
      return false;
    } finally {
      this.saving.set(false);
    }
  }

  async update(input: UpdateClientInput): Promise<boolean> {
    const current = this.clients().find((client) => client.id === input.id);
    if (current && !hasClientChanges(current, input)) return false;

    this.saving.set(true);
    this.error.set(null);

    try {
      await this.repository.update(input);
      await this.loadPage();
      return this.error() === null;
    } catch (error) {
      this.error.set(this.messageFrom(error, 'No se pudo actualizar el cliente.'));
      return false;
    } finally {
      this.saving.set(false);
    }
  }

  clearError(): void {
    this.error.set(null);
  }

  private async loadCollectors(): Promise<void> {
    this.collectorsLoading.set(true);

    try {
      this.collectors.set(await this.repository.listActiveCollectors());
    } catch (error) {
      this.error.set(this.messageFrom(error, 'No se pudo cargar la lista de cobradores.'));
    } finally {
      this.collectorsLoading.set(false);
    }
  }

  private messageFrom(error: unknown, fallback: string): string {
    return AppError.from(error).message || fallback;
  }
}

function hasClientChanges(current: ClientListItem, input: UpdateClientInput): boolean {
  return (
    current.dni !== input.dni.trim() ||
    current.fullName !== input.fullName.trim() ||
    current.phone !== input.phone.trim() ||
    current.address !== input.address.trim() ||
    current.collectorId !== input.collectorId ||
    current.notes !== input.notes.trim() ||
    current.active !== input.active
  );
}
