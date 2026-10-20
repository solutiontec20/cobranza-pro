export interface Client {
  id: string;
  dni: string;
  fullName: string;
  phone: string;
  address: string;
  /** Only used by the temporary local MVP data. It is not persisted in Supabase. */
  addressReference?: string;
  collectorId: string;
  notes: string;
  active: boolean;
  createdAt: string;
}

export interface ClientListItem extends Client {
  collectorName: string;
  outstandingAmount: number;
  overdueDays: number;
  isBlacklisted: boolean;
}

export interface ClientCollectorOption {
  id: string;
  fullName: string;
}

export interface CreateClientInput {
  dni: string;
  fullName: string;
  phone: string;
  address: string;
  collectorId: string;
  notes: string;
}
