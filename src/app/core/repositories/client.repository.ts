import { InjectionToken } from '@angular/core';
import {
  Client,
  ClientCollectorOption,
  ClientListItem,
  CreateClientInput,
} from '../models/client.model';

export interface ClientRepository {
  list(): Promise<ClientListItem[]>;
  listActiveCollectors(): Promise<ClientCollectorOption[]>;
  create(input: CreateClientInput): Promise<Client>;
}

export const CLIENT_REPOSITORY = new InjectionToken<ClientRepository>('CLIENT_REPOSITORY');
