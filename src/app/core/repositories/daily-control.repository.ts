import { InjectionToken } from '@angular/core';
import {
  DailyCashClosure,
  DailyControlCollectorOption,
  DailyControlFilters,
  DailyControlReport,
  SubmitDailyCashClosureInput,
  ValidateDailyCashClosureInput,
} from '../models/daily-control.model';

export interface DailyControlRepository {
  listCollectors(): Promise<DailyControlCollectorOption[]>;
  getReport(filters: DailyControlFilters): Promise<DailyControlReport>;
  listClosures(businessDate: string): Promise<DailyCashClosure[]>;
  submitClosure(input: SubmitDailyCashClosureInput): Promise<DailyCashClosure>;
  validateClosure(input: ValidateDailyCashClosureInput): Promise<DailyCashClosure>;
}

export const DAILY_CONTROL_REPOSITORY = new InjectionToken<DailyControlRepository>(
  'DAILY_CONTROL_REPOSITORY',
);
