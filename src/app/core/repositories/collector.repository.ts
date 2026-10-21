import { InjectionToken } from '@angular/core';
import {
  Collector,
  CreateCollectorInput,
  ResetCollectorPinInput,
  ResetCollectorPinResult,
  SetCollectorActiveInput,
} from '../models/collector.model';

export interface CollectorRepository {
  list(): Promise<Collector[]>;
  create(input: CreateCollectorInput): Promise<Collector>;
  resetPin(input: ResetCollectorPinInput): Promise<ResetCollectorPinResult>;
  setActive(input: SetCollectorActiveInput): Promise<Collector>;
}

export const COLLECTOR_REPOSITORY = new InjectionToken<CollectorRepository>('COLLECTOR_REPOSITORY');
