import { InjectionToken } from '@angular/core';
import {
  Client,
  ClientCollectorOption,
  ClientListItem,
  CreateClientInput,
  UpdateClientInput,
} from '../models/client.model';

export interface ClientRepository {
  list(): Promise<ClientListItem[]>;
  listActiveCollectors(): Promise<ClientCollectorOption[]>;
  create(input: CreateClientInput): Promise<Client>;
  update(input: UpdateClientInput): Promise<Client>;
}

export const CLIENT_REPOSITORY = new InjectionToken<ClientRepository>('CLIENT_REPOSITORY');
