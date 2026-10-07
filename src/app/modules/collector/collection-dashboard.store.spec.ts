import { describe, expect, it } from 'vitest';
import { CollectionDashboardStore } from './collection-dashboard.store';

describe('CollectionDashboardStore', () => {
  it('derives the daily collection summary from the read model', () => {
    const store = new CollectionDashboardStore();

    expect(store.summary()).toEqual({
      dueToday: 5,
      expectedToday: 75,
      collectedToday: 21,
      overdueClients: 4,
      completionPercentage: 28,
    });
  });

  it('searches without accents and across DNI', () => {
    const store = new CollectionDashboardStore();

    store.setQuery('gomez');
    expect(store.filteredClients().map((client) => client.id)).toEqual(['cli-3']);

    store.setQuery('40123456');
    expect(store.filteredClients().map((client) => client.id)).toEqual(['cli-6']);
  });

  it('applies operational filters', () => {
    const store = new CollectionDashboardStore();

    store.setFilter('PAID_TODAY');
    expect(store.filteredClients().map((client) => client.id)).toEqual([
      'cli-2',
      'cli-6',
    ]);

    store.setFilter('DEFAULTED');
    expect(store.filteredClients().map((client) => client.id)).toEqual([
      'cli-4',
      'cli-3',
    ]);
  });

  it('sorts by balance and name', () => {
    const store = new CollectionDashboardStore();

    store.setSortOrder('HIGHEST_BALANCE');
    expect(store.filteredClients()[0].id).toBe('cli-4');

    store.setSortOrder('NAME');
    expect(store.filteredClients().map((client) => client.fullName)).toEqual([
      'Carlos Torres',
      'Elena Morales',
      'Juan Pérez',
      'María López',
      'Roberto Gómez',
      'Rosa Flores',
    ]);
  });

  it('clears the query and active filter together', () => {
    const store = new CollectionDashboardStore();
    store.setQuery('nobody');
    store.setFilter('OVERDUE');

    store.clearFilters();

    expect(store.query()).toBe('');
    expect(store.activeFilter()).toBe('ALL');
    expect(store.filteredClients()).toHaveLength(6);
  });
});
