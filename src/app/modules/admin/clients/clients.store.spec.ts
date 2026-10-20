import { TestBed } from '@angular/core/testing';
import { ClientListItem } from '../../../core/models/client.model';
import {
  CLIENT_REPOSITORY,
  ClientRepository,
} from '../../../core/repositories/client.repository';
import { ClientsStore } from './clients.store';

const client: ClientListItem = {
  id: 'client-1',
  dni: '45678901',
  fullName: 'Ana Flores',
  phone: '987654321',
  address: 'Av. Principal 123',
  collectorId: 'collector-1',
  collectorName: 'María Quispe',
  notes: '',
  active: true,
  createdAt: '2026-10-20T00:00:00Z',
  outstandingAmount: 0,
  overdueDays: 0,
  isBlacklisted: false,
};

describe('ClientsStore', () => {
  let store: ClientsStore;
  let repository: {
    list: ReturnType<typeof vi.fn<ClientRepository['list']>>;
    listActiveCollectors: ReturnType<typeof vi.fn<ClientRepository['listActiveCollectors']>>;
    create: ReturnType<typeof vi.fn<ClientRepository['create']>>;
    update: ReturnType<typeof vi.fn<ClientRepository['update']>>;
  };

  beforeEach(() => {
    repository = {
      list: vi.fn<ClientRepository['list']>().mockResolvedValue([client]),
      listActiveCollectors: vi
        .fn<ClientRepository['listActiveCollectors']>()
        .mockResolvedValue([{ id: 'collector-1', fullName: 'María Quispe' }]),
      create: vi.fn<ClientRepository['create']>().mockResolvedValue(client),
      update: vi.fn<ClientRepository['update']>().mockResolvedValue(client),
    };

    TestBed.configureTestingModule({
      providers: [ClientsStore, { provide: CLIENT_REPOSITORY, useValue: repository }],
    });
    store = TestBed.inject(ClientsStore);
  });

  it('loads clients and active collectors together', async () => {
    await store.load();

    expect(store.clients()).toEqual([client]);
    expect(store.collectors()).toEqual([{ id: 'collector-1', fullName: 'María Quispe' }]);
  });

  it('creates a client and reloads server state', async () => {
    const created = await store.create({
      dni: client.dni,
      fullName: client.fullName,
      phone: client.phone,
      address: client.address,
      collectorId: client.collectorId,
      notes: client.notes,
    });

    expect(created).toBe(true);
    expect(repository.create).toHaveBeenCalledOnce();
    expect(repository.list).toHaveBeenCalledOnce();
  });

  it('updates a client and reloads server state', async () => {
    const updated = await store.update({
      id: client.id,
      dni: client.dni,
      fullName: 'Ana Flores actualizada',
      phone: client.phone,
      address: client.address,
      collectorId: client.collectorId,
      notes: client.notes,
      active: client.active,
    });

    expect(updated).toBe(true);
    expect(repository.update).toHaveBeenCalledOnce();
    expect(repository.list).toHaveBeenCalledOnce();
  });
});
