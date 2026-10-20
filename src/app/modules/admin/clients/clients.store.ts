import { inject, Injectable, signal } from '@angular/core';
import { AppError } from '../../../core/errors/app-error';
import {
  ClientCollectorOption,
  ClientListItem,
  CreateClientInput,
} from '../../../core/models/client.model';
import { CLIENT_REPOSITORY } from '../../../core/repositories/client.repository';

@Injectable()
export class ClientsStore {
  private readonly repository = inject(CLIENT_REPOSITORY);

  readonly clients = signal<ClientListItem[]>([]);
  readonly collectors = signal<ClientCollectorOption[]>([]);
  readonly loading = signal(false);
  readonly creating = signal(false);
  readonly error = signal<string | null>(null);

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const [clients, collectors] = await Promise.all([
        this.repository.list(),
        this.repository.listActiveCollectors(),
      ]);
      this.clients.set(clients);
      this.collectors.set(collectors);
    } catch (error) {
      this.error.set(this.messageFrom(error, 'No se pudo cargar la gestión de clientes.'));
    } finally {
      this.loading.set(false);
    }
  }

  async create(input: CreateClientInput): Promise<boolean> {
    this.creating.set(true);
    this.error.set(null);

    try {
      await this.repository.create(input);
      await this.load();
      return this.error() === null;
    } catch (error) {
      this.error.set(this.messageFrom(error, 'No se pudo registrar el cliente.'));
      return false;
    } finally {
      this.creating.set(false);
    }
  }

  clearError(): void {
    this.error.set(null);
  }

  private messageFrom(error: unknown, fallback: string): string {
    return AppError.from(error).message || fallback;
  }
}
