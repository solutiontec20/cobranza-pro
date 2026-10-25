import { TestBed } from '@angular/core/testing';
import { AppError } from '../../../core/errors/app-error';
import { Collector } from '../../../core/models/collector.model';
import {
  COLLECTOR_REPOSITORY,
  CollectorRepository,
} from '../../../core/repositories/collector.repository';
import { CollectorsStore } from './collectors.store';

const collector: Collector = {
  id: 'collector-1',
  dni: '12345678',
  fullName: 'María Quispe',
  phone: '912345678',
  active: true,
  createdAt: '2026-10-19T12:00:00Z',
  activeCustomerCount: 2,
};

describe('CollectorsStore', () => {
  let store: CollectorsStore;
  let repository: {
    list: ReturnType<typeof vi.fn<CollectorRepository['list']>>;
    create: ReturnType<typeof vi.fn<CollectorRepository['create']>>;
    update: ReturnType<typeof vi.fn<CollectorRepository['update']>>;
    resetPin: ReturnType<typeof vi.fn<CollectorRepository['resetPin']>>;
    setActive: ReturnType<typeof vi.fn<CollectorRepository['setActive']>>;
  };

  beforeEach(() => {
    repository = {
      list: vi.fn<CollectorRepository['list']>().mockResolvedValue([collector]),
      create: vi.fn<CollectorRepository['create']>(),
      update: vi.fn<CollectorRepository['update']>(),
      resetPin: vi.fn<CollectorRepository['resetPin']>(),
      setActive: vi.fn<CollectorRepository['setActive']>(),
    };

    TestBed.configureTestingModule({
      providers: [CollectorsStore, { provide: COLLECTOR_REPOSITORY, useValue: repository }],
    });
    store = TestBed.inject(CollectorsStore);
  });

  it('loads collectors and filters without accents', async () => {
    await store.load();
    store.query.set('maria');

    expect(store.filteredCollectors()).toEqual([collector]);
    expect(store.summary()).toEqual({ total: 1, active: 1, inactive: 0, assignedCustomers: 2 });
  });

  it('adds a newly created collector to state', async () => {
    const created = { ...collector, id: 'collector-2', fullName: 'Ana Flores' };
    repository.create.mockResolvedValue(created);

    const result = await store.create({
      fullName: created.fullName,
      dni: created.dni,
      phone: created.phone,
      temporaryPin: '123456',
    });

    expect(result).toBe(true);
    expect(store.collectors()).toEqual([created]);
  });

  it('surfaces the portfolio reassignment error', async () => {
    repository.setActive.mockRejectedValue(
      new AppError(
        'VALIDATION',
        'No podés desactivar al cobrador mientras tenga clientes activos. Reasigná su cartera primero.',
      ),
    );

    const result = await store.setActive({
      collectorId: collector.id,
      active: false,
      reason: 'Salida del equipo',
    });

    expect(result).toBe(false);
    expect(store.error()).toContain('Reasigná su cartera primero');
  });

  it('returns the one-time temporary PIN after an administrative reset', async () => {
    repository.resetPin.mockResolvedValue({
      collectorId: collector.id,
      collectorName: collector.fullName,
      temporaryPin: '482907',
    });

    const result = await store.resetPin({
      collectorId: collector.id,
      reason: 'El cobrador olvidó su PIN',
    });

    expect(result?.temporaryPin).toBe('482907');
    expect(repository.resetPin).toHaveBeenCalledOnce();
    expect(store.resettingCollectorId()).toBeNull();
  });

  it('updates the edited collector in state, keeping DNI unchanged', async () => {
    await store.load();
    const updated = { ...collector, fullName: 'María Quispe Flores', phone: '911112222' };
    repository.update.mockResolvedValue(updated);

    const result = await store.update({
      collectorId: collector.id,
      fullName: updated.fullName,
      phone: updated.phone,
      reason: 'Corrección de datos personales',
    });

    expect(result).toBe(true);
    expect(store.collectors()).toEqual([updated]);
    expect(store.editingCollectorId()).toBeNull();
  });

  it('surfaces the edit error without mutating state', async () => {
    await store.load();
    repository.update.mockRejectedValue(
      new AppError('VALIDATION', 'No se encontró el cobrador.'),
    );

    const result = await store.update({
      collectorId: collector.id,
      fullName: 'Nombre inválido',
      phone: null,
      reason: 'Corrección',
    });

    expect(result).toBe(false);
    expect(store.error()).toContain('No se encontró el cobrador.');
    expect(store.collectors()).toEqual([collector]);
  });
});
