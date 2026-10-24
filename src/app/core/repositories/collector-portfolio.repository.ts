import { InjectionToken } from '@angular/core';
import {
  CollectorPortfolioEntry,
  CreateCollectorClientInput,
  CreateCollectorClientResult,
} from '../models/collector-portfolio.model';

export interface CollectorPortfolioRepository {
  /** Rows for the authenticated collector's own customers, scoped to today's business date. */
  listPortfolio(businessDate: string): Promise<CollectorPortfolioEntry[]>;

  /** Atomically creates a new customer and their first loan for the authenticated collector. */
  createClient(input: CreateCollectorClientInput): Promise<CreateCollectorClientResult>;

  /** Most recent loan id for a customer in the collector's own portfolio, or null if none. */
  findLatestLoanId(customerId: string): Promise<string | null>;
}

export const COLLECTOR_PORTFOLIO_REPOSITORY = new InjectionToken<CollectorPortfolioRepository>(
  'COLLECTOR_PORTFOLIO_REPOSITORY',
);
