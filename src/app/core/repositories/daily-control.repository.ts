import { InjectionToken } from '@angular/core';
import {
  DailyControlCollectorOption,
  DailyControlFilters,
  DailyControlReport,
} from '../models/daily-control.model';

export interface DailyControlRepository {
  listCollectors(): Promise<DailyControlCollectorOption[]>;
  getReport(filters: DailyControlFilters): Promise<DailyControlReport>;
}

export const DAILY_CONTROL_REPOSITORY = new InjectionToken<DailyControlRepository>(
  'DAILY_CONTROL_REPOSITORY',
);
