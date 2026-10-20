import { InjectionToken } from '@angular/core';
import {
  Collector,
  CreateCollectorInput,
  SetCollectorActiveInput,
} from '../models/collector.model';

export interface CollectorRepository {
  list(): Promise<Collector[]>;
  create(input: CreateCollectorInput): Promise<Collector>;
  setActive(input: SetCollectorActiveInput): Promise<Collector>;
}

export const COLLECTOR_REPOSITORY = new InjectionToken<CollectorRepository>('COLLECTOR_REPOSITORY');
