import { InjectionToken } from '@angular/core';
import {
  CorrectionRequest,
  CorrectionRequestReceipt,
  CorrectionRequestResolution,
  CorrectionRequestStatus,
  CreateCorrectionRequestInput,
  RejectCorrectionRequestInput,
  ResolveCorrectionRequestInput,
  ResolveEditLoanRequestInput,
} from '../models/correction-request.model';

export interface CorrectionRequestRepository {
  list(status?: CorrectionRequestStatus | null, limit?: number): Promise<CorrectionRequest[]>;
  countPending(): Promise<number>;
  create(input: CreateCorrectionRequestInput): Promise<CorrectionRequestReceipt>;
  reject(input: RejectCorrectionRequestInput): Promise<CorrectionRequestResolution>;
  resolveEdit(input: ResolveEditLoanRequestInput): Promise<CorrectionRequestResolution>;
  resolveVoidLoan(input: ResolveCorrectionRequestInput): Promise<CorrectionRequestResolution>;
  resolveVoidPayment(input: ResolveCorrectionRequestInput): Promise<CorrectionRequestResolution>;
}

export const CORRECTION_REQUEST_REPOSITORY = new InjectionToken<CorrectionRequestRepository>(
  'CORRECTION_REQUEST_REPOSITORY',
);
