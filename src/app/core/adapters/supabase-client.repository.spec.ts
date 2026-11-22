import { TestBed } from '@angular/core/testing';
import { SUPABASE } from '../supabase/supabase-client';
import { SupabaseClientRepository } from './supabase-client.repository';

describe('SupabaseClientRepository', () => {
  const rpc = vi.fn();
  const from = vi.fn(() => {
    throw new Error('The paginated client list must not use sequential table reads.');
  });
  let repository: SupabaseClientRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [SupabaseClientRepository, { provide: SUPABASE, useValue: { from, rpc } }],
    });
    repository = TestBed.inject(SupabaseClientRepository);
  });

  it('loads one client page and its financial summary through one RPC', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          id: 'client-1',
          document_number: '45678901',
          full_name: 'Ana Flores',
          phone: null,
          address: 'Av. Principal 123',
          notes: null,
          collector_id: 'collector-1',
          collector_name: 'María Quispe',
          active: true,
          created_at: '2026-10-20T00:00:00Z',
          outstanding_amount: 110,
          max_overdue_days: 6,
          is_blacklisted: true,
          total_count: 90,
        },
      ],
      error: null,
    });

    await expect(
      repository.list({
        pageIndex: 1,
        pageSize: 10,
        search: ' Ana ',
        collectorId: 'collector-1',
      }),
    ).resolves.toEqual({
      items: [
        {
          id: 'client-1',
          dni: '45678901',
          fullName: 'Ana Flores',
          phone: '',
          address: 'Av. Principal 123',
          collectorId: 'collector-1',
          collectorName: 'María Quispe',
          notes: '',
          active: true,
          createdAt: '2026-10-20T00:00:00Z',
          outstandingAmount: 110,
          overdueDays: 6,
          isBlacklisted: true,
        },
      ],
      total: 90,
    });
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith('admin_list_clients_page', {
      p_page_index: 1,
      p_page_size: 10,
      p_search: 'Ana',
      p_collector_id: 'collector-1',
    });
    expect(from).not.toHaveBeenCalled();
  });

  it('preserves the filtered total when the requested page is empty', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          id: null,
          document_number: null,
          full_name: null,
          phone: null,
          address: null,
          notes: null,
          collector_id: null,
          collector_name: null,
          active: null,
          created_at: null,
          outstanding_amount: null,
          max_overdue_days: null,
          is_blacklisted: null,
          total_count: 3,
        },
      ],
      error: null,
    });

    await expect(
      repository.list({ pageIndex: 10, pageSize: 10, search: '', collectorId: null }),
    ).resolves.toEqual({ items: [], total: 3 });
  });
});
