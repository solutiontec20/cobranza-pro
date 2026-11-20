export interface AdminDashboardRiskBucket {
  count: number;
  percent: number;
}

export interface AdminDashboardRiskDistribution {
  green: AdminDashboardRiskBucket;
  yellow: AdminDashboardRiskBucket;
  orange: AdminDashboardRiskBucket;
  red: AdminDashboardRiskBucket;
}

/**
 * Portfolio-wide KPIs for the admin "Dashboard general" screen.
 *
 * `totalCobrado` intentionally only sums payments on currently ACTIVE loans
 * (mirrors `admin_dashboard_summary`'s SQL) -- a loan that has already been
 * fully paid off no longer contributes to this figure. This matches the
 * behavior of the screen before it was backed by Supabase; revisit this
 * definition with the business if a lifetime "total recovered" figure is
 * wanted instead.
 */
export interface AdminDashboardSummary {
  capitalPrestado: number;
  totalEsperado: number;
  totalCobrado: number;
  saldoPendiente: number;
  totalClientes: number;
  prestamosPagados: number;
  cobradores: number;
  morosidad: number;
  riskDistribution: AdminDashboardRiskDistribution;
}

export interface CollectorPerformanceEntry {
  id: string;
  name: string;
  dni: string;
  clientsCount: number;
  expectedToday: number;
  collectedToday: number;
  pendingToday: number;
  delayedCount: number;
}
