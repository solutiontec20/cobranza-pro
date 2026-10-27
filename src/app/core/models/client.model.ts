export interface Client {
  id: string;
  dni: string;
  fullName: string;
  phone: string;
  address: string;
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

export interface UpdateClientInput extends CreateClientInput {
  id: string;
  active: boolean;
}
