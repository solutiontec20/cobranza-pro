import { TestBed } from '@angular/core/testing';
import { SUPABASE } from '../supabase/supabase-client';
import { SupabaseLoanRepository } from './supabase-loan.repository';

describe('SupabaseLoanRepository loan detail', () => {
  it('combines customer, schedule, and auditable payment history', async () => {
    const from = vi.fn((table: string) => {
      if (table === 'loans') {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({
                data: {
                  id: 'loan-1',
                  customer_id: 'customer-1',
                  principal_amount: 100,
                  interest_rate_percent: 10,
                  total_amount: 110,
                  installment_count: 3,
                  frequency: 'daily',
                  started_on: '2026-10-20',
                  status: 'active',
                  created_at: '2026-10-20T12:00:00Z',
                  customer: {
                    id: 'customer-1',
                    document_number: '12345678',
                    full_name: 'Ana Flores',
                    phone: '987654321',
                    address: 'Av. Principal 123',
                    notes: 'Cliente puntual',
                    collector_id: 'collector-1',
                    collector: {
                      id: 'collector-1',
                      full_name: 'María Quispe',
                    },
                  },
                },
                error: null,
              }),
            }),
          }),
        };
      }

      if (table === 'installment_balances') {
        return {
          select: () => ({
            eq: () => ({
              order: () => Promise.resolve({
                data: [
                  {
                    id: 'installment-1',
                    loan_id: 'loan-1',
                    installment_number: 1,
                    due_date: '2026-10-20',
                    scheduled_amount: 40,
                    paid_amount: 10,
                    outstanding_amount: 30,
                    status: 'pending',
                    overdue_days: 0,
                  },
                ],
                error: null,
              }),
            }),
          }),
        };
      }

      if (table === 'payments') {
        return {
          select: () => ({
            eq: () => ({
              order: () => Promise.resolve({
                data: [
                  {
                    id: 'payment-1',
                    amount: 10,
                    payment_method: 'cash',
                    paid_at: '2026-10-20T15:00:00Z',
                    business_date: '2026-10-20',
                    status: 'posted',
                    notes: 'Pago en oficina',
                    collector_id: 'collector-1',
                    void_reason: null,
                    collector: {
                      id: 'collector-1',
                      full_name: 'María Quispe',
                    },
                  },
                ],
                error: null,
              }),
            }),
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    });

    TestBed.configureTestingModule({
      providers: [
        SupabaseLoanRepository,
        { provide: SUPABASE, useValue: { from, rpc: vi.fn() } },
      ],
    });

    const repository = TestBed.inject(SupabaseLoanRepository);
    const detail = await repository.getDetail('loan-1');

    expect(detail.client).toMatchObject({
      dni: '12345678',
      phone: '987654321',
      collectorName: 'María Quispe',
    });
    expect(detail.loan).toMatchObject({
      balance: 100,
      installmentAmount: 40,
      endDate: '2026-10-20',
      clientDni: '12345678',
    });
    expect(detail.installments[0].status).toBe('partial');
    expect(detail.payments).toEqual([
      expect.objectContaining({
        amount: 10,
        paymentMethod: 'cash',
        collectorName: 'María Quispe',
        status: 'posted',
      }),
    ]);
  });
});
