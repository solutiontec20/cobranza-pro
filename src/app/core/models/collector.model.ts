export interface Collector {
  id: string;
  dni: string;
  fullName: string;
  phone: string | null;
  active: boolean;
  createdAt: string;
  activeCustomerCount: number;
}

export interface CreateCollectorInput {
  fullName: string;
  dni: string;
  phone: string | null;
  temporaryPin: string;
}

export interface SetCollectorActiveInput {
  collectorId: string;
  active: boolean;
  reason: string;
}
