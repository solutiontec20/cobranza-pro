import { afterEach, describe, expect, it, vi } from 'vitest';

import { LoanDetail } from '../models/loan.model';
import { LoanStatementShareService } from './loan-statement-share.service';

const detail = {
  loan: {
    id: 'loan-1',
    clientId: 'client-1',
    clientName: 'María Quispe',
    clientDni: '45678912',
    collectorId: 'collector-1',
    collectorName: 'Rosa',
    principal: 100,
    interestRate: 20,
    totalAmount: 120,
    installmentAmount: 120,
    installmentCount: 1,
    frequency: 'daily',
    balance: 120,
    status: 'active',
    startedOn: '2026-11-19',
    endDate: '2026-11-20',
    createdAt: '2026-11-19T14:00:00Z',
  },
  client: {
    id: 'client-1',
    dni: '45678912',
    fullName: 'María Quispe',
    phone: null,
    address: null,
    notes: null,
    collectorId: 'collector-1',
    collectorName: 'Rosa',
  },
  installments: [],
  payments: [],
} satisfies LoanDetail;

const ISSUED_AT = new Date('2026-11-26T22:40:00Z');

function stubNavigator(overrides: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(overrides)) {
    Object.defineProperty(navigator, key, { value, configurable: true });
  }
}

describe('LoanStatementShareService', () => {
  afterEach(() => {
    for (const key of ['share', 'canShare', 'clipboard']) {
      Reflect.deleteProperty(navigator, key);
    }
    vi.restoreAllMocks();
  });

  it('reports no sharing support when the browser has no native share sheet', () => {
    const service = new LoanStatementShareService();

    expect(service.canShareText()).toBe(false);
    expect(service.canShareFile()).toBe(false);
  });

  it('shares the statement as text through the native share sheet', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ share });

    await expect(new LoanStatementShareService().shareText(detail, ISSUED_AT)).resolves.toBe(
      'done',
    );

    expect(share).toHaveBeenCalledOnce();
    expect(share.mock.calls[0][0].text).toContain('DNI: 45678912');
  });

  it('shares the statement as a named .txt file when the browser allows files', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ share, canShare: vi.fn().mockReturnValue(true) });
    const service = new LoanStatementShareService();

    expect(service.canShareFile()).toBe(true);
    await service.shareFile(detail, ISSUED_AT);

    const [file] = share.mock.calls[0][0].files as File[];
    expect(file.name).toBe('estado-de-cuenta_45678912_2026-11-26.txt');
    expect(file.type).toBe('text/plain');
  });

  it('treats a dismissed share sheet as a cancellation, not as an error', async () => {
    stubNavigator({ share: vi.fn().mockRejectedValue(new DOMException('', 'AbortError')) });

    await expect(new LoanStatementShareService().shareText(detail, ISSUED_AT)).resolves.toBe(
      'cancelled',
    );
  });

  it('propagates any other sharing failure so the screen can warn the user', async () => {
    stubNavigator({ share: vi.fn().mockRejectedValue(new DOMException('', 'NotAllowedError')) });

    await expect(new LoanStatementShareService().shareText(detail, ISSUED_AT)).rejects.toThrow();
  });

  it('copies the statement text to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ clipboard: { writeText } });
    const service = new LoanStatementShareService();

    expect(service.canCopy()).toBe(true);
    await service.copy(detail, ISSUED_AT);

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('ESTADO DE CUENTA'));
  });
});
