import { InjectionToken } from '@angular/core';
import {
  CorrectionRequest,
  CorrectionRequestChange,
  CorrectionRequestRealtimeStatus,
  CorrectionRequestReceipt,
  CorrectionRequestResolution,
  CorrectionRequestStatus,
  CorrectionRequestSubscription,
  CreateCorrectionRequestInput,
  RejectCorrectionRequestInput,
  ResolveCorrectionRequestInput,
  ResolveEditLoanRequestInput,
} from '../models/correction-request.model';

export interface CorrectionRequestRepository {
  list(status?: CorrectionRequestStatus | null, limit?: number): Promise<CorrectionRequest[]>;
  listMine(limit?: number): Promise<CorrectionRequest[]>;
  countPending(): Promise<number>;
  countMineUnread(): Promise<number>;
  markMineRead(): Promise<number>;
  subscribe(
    subscription: CorrectionRequestSubscription,
    onChange: (change: CorrectionRequestChange) => void,
    onStatus?: (status: CorrectionRequestRealtimeStatus) => void,
  ): () => void;
  create(input: CreateCorrectionRequestInput): Promise<CorrectionRequestReceipt>;
  reject(input: RejectCorrectionRequestInput): Promise<CorrectionRequestResolution>;
  resolveEdit(input: ResolveEditLoanRequestInput): Promise<CorrectionRequestResolution>;
  resolveVoidLoan(input: ResolveCorrectionRequestInput): Promise<CorrectionRequestResolution>;
  resolveVoidPayment(input: ResolveCorrectionRequestInput): Promise<CorrectionRequestResolution>;
}

export const CORRECTION_REQUEST_REPOSITORY = new InjectionToken<CorrectionRequestRepository>(
  'CORRECTION_REQUEST_REPOSITORY',
);
