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

export interface ClientListQuery {
  pageIndex: number;
  pageSize: number;
  search: string;
  collectorId: string | null;
}

export interface ClientPage {
  items: ClientListItem[];
  total: number;
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
