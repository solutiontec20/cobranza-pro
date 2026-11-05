import { InjectionToken } from '@angular/core';
import {
  Client,
  ClientCollectorOption,
  ClientListQuery,
  ClientPage,
  CreateClientInput,
  UpdateClientInput,
} from '../models/client.model';

export interface ClientRepository {
  list(query: ClientListQuery, abortSignal?: AbortSignal): Promise<ClientPage>;
  listActiveCollectors(): Promise<ClientCollectorOption[]>;
  create(input: CreateClientInput): Promise<Client>;
  update(input: UpdateClientInput): Promise<Client>;
}

export const CLIENT_REPOSITORY = new InjectionToken<ClientRepository>('CLIENT_REPOSITORY');
