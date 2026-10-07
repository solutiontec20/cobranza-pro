import { Injectable, computed, signal } from '@angular/core';
import { Profile, RiskLevel, FrequencyType } from '../models/profile.model';
import { Client } from '../models/client.model';
import { Loan } from '../models/loan.model';
import { Installment } from '../models/installment.model';
import { Payment, AuditLog, AppDatabase } from '../models/payment.model';

const STORAGE_KEY = 'cobranzapro_db_v1';
export const SYSTEM_DATE = '2026-10-07';

@Injectable({ providedIn: 'root' })
export class AppStoreService {
  private readonly _data = signal<AppDatabase>(this.loadOrInit());
  
  // Read-only projections
  readonly profiles = computed(() => this._data().profiles);
  readonly clients = computed(() => this._data().clients);
  readonly loans = computed(() => this._data().loans);
  readonly loanInstallments = computed(() => this._data().loanInstallments);
  readonly payments = computed(() => this._data().payments);
  readonly auditLogs = computed(() => this._data().auditLogs);

  getLoanOverdueDays(loanId: string): number {
    const loan = this.loans().find(l => l.id === loanId);
    if (!loan || loan.status !== 'ACTIVE') return 0;
    
    const overdueInsts = this.loanInstallments().filter(inst => {
      return inst.loanId === loanId && 
             inst.dueDate < SYSTEM_DATE && 
             inst.status !== 'PAGADO';
    });
    return overdueInsts.length;
  }

  getClientTodayInstallment(loanId: string): Installment | undefined {
    if (!loanId) return undefined;
    return this.loanInstallments().find(inst => inst.loanId === loanId && inst.dueDate === SYSTEM_DATE);
  }

  getClientRiskStatus(client: Client): { days: number; level: RiskLevel; text: string; isMoroso: boolean; isPaid: boolean } {
    const activeLoan = this.loans().find(l => l.clientId === client.id && l.status === 'ACTIVE');
    if (!activeLoan) {
      const paidLoan = this.loans().find(l => l.clientId === client.id && l.status === 'PAID');
      if (paidLoan) {
        return { days: 0, level: 'green', text: 'PAGADO', isMoroso: false, isPaid: true };
      }
      return { days: 0, level: 'gray', text: 'SIN PRÉSTAMO', isMoroso: false, isPaid: false };
    }

    const overdueDays = this.getLoanOverdueDays(activeLoan.id);
    if (overdueDays === 0) {
      return { days: 0, level: 'green', text: 'AL DÍA (0 días)', isMoroso: false, isPaid: false };
    } else if (overdueDays <= 5) {
      return { days: overdueDays, level: 'yellow', text: `ATRASO (${overdueDays} d)`, isMoroso: false, isPaid: false };
    } else if (overdueDays <= 10) {
      return { days: overdueDays, level: 'orange', text: `ATRASO (${overdueDays} d)`, isMoroso: false, isPaid: false };
    } else {
      return { days: overdueDays, level: 'red', text: `MOROSO (${overdueDays} d)`, isMoroso: true, isPaid: false };
    }
  }

  hasClientPaidToday(clientId: string): boolean {
    return this.payments().some(p => p.clientId === clientId && p.date === SYSTEM_DATE);
  }

  registerPayment(loanId: string, amount: number, notes: string, userId: string): { success: boolean; amount: number; newBalance: number; isPaidOff: boolean } {
    amount = parseFloat(amount.toString());
    if (isNaN(amount) || amount <= 0) {
      throw new Error('El monto recibido debe ser mayor a cero');
    }

    const data = this._data();
    const loan = data.loans.find(l => l.id === loanId);
    if (!loan) throw new Error('Préstamo no encontrado');
    if (loan.status !== 'ACTIVE') throw new Error('El préstamo no está activo');
    if (amount > loan.balance) {
      throw new Error(`El monto recibido (S/ ${amount.toFixed(2)}) supera el saldo pendiente (S/ ${loan.balance.toFixed(2)})`);
    }

    const currentUser = data.profiles.find(p => p.id === userId);
    const paymentId = 'pay-' + Date.now();
    const newPayment: Payment = {
      id: paymentId,
      loanId: loan.id,
      clientId: loan.clientId,
      collectorId: userId,
      amount: amount,
      date: SYSTEM_DATE,
      notes: notes || 'Cobranza en campo',
      createdBy: userId,
      createdAt: new Date().toISOString()
    };
    
    const newPayments = [newPayment, ...data.payments];

    let unallocated = amount;
    const newInstallments = data.loanInstallments.map(inst => ({...inst}));
    const installments = newInstallments
      .filter(i => i.loanId === loan.id && i.status !== 'PAGADO')
      .sort((a, b) => a.installmentNumber - b.installmentNumber);

    for (let inst of installments) {
      if (unallocated <= 0) break;
      if (unallocated >= inst.remainingAmount) {
        unallocated -= inst.remainingAmount;
        inst.paidAmount += inst.remainingAmount;
        inst.remainingAmount = 0;
        inst.status = 'PAGADO';
      } else {
        inst.paidAmount += unallocated;
        inst.remainingAmount -= unallocated;
        inst.status = 'PAGO_PARCIAL';
        unallocated = 0;
      }
    }

    const newLoans = data.loans.map(l => {
      if (l.id !== loanId) return l;
      const newBalance = Math.max(0, parseFloat((l.balance - amount).toFixed(2)));
      return {
        ...l,
        balance: newBalance,
        status: newBalance === 0 ? 'PAID' : l.status
      };
    });

    const client = data.clients.find(c => c.id === loan.clientId);
    const updatedLoan = newLoans.find(l => l.id === loanId)!;
    
    const newAuditLog: AuditLog = {
      id: 'aud-' + Date.now(),
      userId: userId,
      userName: currentUser ? currentUser.fullName : 'Desconocido',
      action: 'REGISTRAR_PAGO',
      entity: 'payments',
      entityId: paymentId,
      details: `Pago de S/ ${amount.toFixed(2)} registrado para ${client ? client.fullName : 'cliente'}. Nuevo saldo: S/ ${updatedLoan.balance.toFixed(2)}`,
      createdAt: new Date().toLocaleString('es-PE')
    };

    this._data.set({
      ...data,
      loans: newLoans,
      loanInstallments: newInstallments,
      payments: newPayments,
      auditLogs: [newAuditLog, ...data.auditLogs]
    });
    
    this.save();
    return {
      success: true,
      amount,
      newBalance: updatedLoan.balance,
      isPaidOff: updatedLoan.status === 'PAID'
    };
  }

  createLoan(params: { clientId: string; principal: number; interestRate: number; frequency: FrequencyType; numberOfInstallments: number; startDate: string }, userId: string): Loan {
    let { principal, interestRate, numberOfInstallments } = params;
    principal = parseFloat(principal.toString());
    interestRate = parseFloat(interestRate.toString());
    numberOfInstallments = parseInt(numberOfInstallments.toString(), 10);

    const data = this._data();
    const client = data.clients.find(c => c.id === params.clientId);
    if (!client) throw new Error('Cliente no encontrado');

    const existingActive = data.loans.find(l => l.clientId === params.clientId && l.status === 'ACTIVE');
    if (existingActive) {
      throw new Error('El cliente ya tiene un préstamo ACTIVO. No se permite más de uno a la vez.');
    }

    const interestAmount = parseFloat((principal * (interestRate / 100)).toFixed(2));
    const totalAmount = parseFloat((principal + interestAmount).toFixed(2));
    const installmentAmount = parseFloat((totalAmount / numberOfInstallments).toFixed(2));

    const loanId = 'loan-' + Date.now();
    const loan: Loan = {
      id: loanId,
      clientId: params.clientId,
      collectorId: client.collectorId,
      principal,
      interestRate,
      interestAmount,
      totalAmount,
      installmentAmount,
      frequency: params.frequency,
      numberOfInstallments,
      startDate: params.startDate,
      endDate: params.startDate,
      balance: totalAmount,
      status: 'ACTIVE',
      createdAt: SYSTEM_DATE
    };

    const installments = this.generateSchedule(loan);
    loan.endDate = installments[installments.length - 1].dueDate;

    const currentUser = data.profiles.find(p => p.id === userId);

    const newAuditLog: AuditLog = {
      id: 'aud-' + Date.now(),
      userId: userId,
      userName: currentUser ? currentUser.fullName : 'Desconocido',
      action: 'CREAR_PRESTAMO',
      entity: 'loans',
      entityId: loanId,
      details: `Préstamo creado de S/ ${principal} al ${interestRate}% (${numberOfInstallments} cuotas de S/ ${installmentAmount}) para ${client.fullName}`,
      createdAt: new Date().toLocaleString('es-PE')
    };

    this._data.set({
      ...data,
      loans: [loan, ...data.loans],
      loanInstallments: [...data.loanInstallments, ...installments],
      auditLogs: [newAuditLog, ...data.auditLogs]
    });

    this.save();
    return loan;
  }

  addClient(client: Omit<Client, 'id' | 'createdAt'>): Client {
    const data = this._data();
    const newClient: Client = {
      ...client,
      id: 'cli-' + Date.now(),
      createdAt: SYSTEM_DATE
    };
    
    this._data.set({
      ...data,
      clients: [newClient, ...data.clients]
    });
    
    this.save();
    return newClient;
  }

  resetData(): void {
    const initial = this.getInitialDatabase();
    this._data.set(initial);
    this.save();
  }

  private loadOrInit(): AppDatabase {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch (e) {
        console.error('Error al cargar datos locales, reiniciando:', e);
      }
    }
    const initial = this.getInitialDatabase();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
    return initial;
  }

  private save(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this._data()));
  }

  private generateSchedule(loan: Loan): Installment[] {
    const list: Installment[] = [];
    let d = new Date(loan.startDate + 'T00:00:00');
    let count = 0;
    while (count < loan.numberOfInstallments) {
      if (loan.frequency === 'DIARIO') {
        const day = d.getDay();
        if (day === 0) { d.setDate(d.getDate() + 1); continue; }
        if (day === 6) { d.setDate(d.getDate() + 2); continue; }
      }
      count++;
      const dateStr = d.toISOString().split('T')[0];
      list.push({
        id: `inst-${loan.id}-${count}`,
        loanId: loan.id,
        installmentNumber: count,
        dueDate: dateStr,
        expectedAmount: loan.installmentAmount,
        paidAmount: 0,
        remainingAmount: loan.installmentAmount,
        status: 'PENDIENTE'
      });
      if (loan.frequency === 'DIARIO') d.setDate(d.getDate() + 1);
      else if (loan.frequency === 'SEMANAL') d.setDate(d.getDate() + 7);
      else if (loan.frequency === 'MENSUAL') d.setMonth(d.getMonth() + 1);
      else d.setFullYear(d.getFullYear() + 1);
    }
    return list;
  }

  private getInitialDatabase(): AppDatabase {
    const profiles: Profile[] = [
      { id: 'prof-admin', dni: '10203040', fullName: 'Carlos Mendoza', phone: '987654321', role: 'ADMINISTRADOR', pin: '1234', active: true, failedAttempts: 0, lockedUntil: null },
      { id: 'prof-cobrador-1', dni: '20304050', fullName: 'Pedro Castillo', phone: '912345678', role: 'COBRADOR', pin: '1234', active: true, failedAttempts: 0, lockedUntil: null },
      { id: 'prof-cobrador-2', dni: '30405060', fullName: 'Luis Quispe', phone: '923456789', role: 'COBRADOR', pin: '1234', active: true, failedAttempts: 0, lockedUntil: null }
    ];

    const clients: Client[] = [
      { id: 'cli-1', dni: '45678901', fullName: 'Juan Pérez', phone: '991122334', address: 'Av. España 450, Trujillo', addressReference: 'Frente al parque principal', collectorId: 'prof-cobrador-1', notes: 'Cliente puntual en pagos matutinos', active: true, createdAt: '2026-09-01' },
      { id: 'cli-2', dni: '46789012', fullName: 'María López', phone: '992233445', address: 'Jr. Pizarro 210, Trujillo', addressReference: 'Botica San José', collectorId: 'prof-cobrador-1', notes: 'Paga habitualmente después de las 3pm', active: true, createdAt: '2026-09-05' },
      { id: 'cli-3', dni: '47890123', fullName: 'Roberto Gómez', phone: '993344556', address: 'Av. Larco 820, Trujillo', addressReference: 'Mercado Central puesto 14', collectorId: 'prof-cobrador-1', notes: 'Negocio de abarrotes', active: true, createdAt: '2026-09-08' },
      { id: 'cli-4', dni: '48901234', fullName: 'Carlos Torres', phone: '994455667', address: 'Ca. Bolognesi 105, Trujillo', addressReference: 'Portón azul de dos pisos', collectorId: 'prof-cobrador-1', notes: 'Dificultades de cobranza, requiere seguimiento estricto', active: true, createdAt: '2026-08-20' },
      { id: 'cli-5', dni: '49012345', fullName: 'Rosa Flores', phone: '995566778', address: 'Av. América Sur 1200, Trujillo', addressReference: 'Esquina Grifo Primax', collectorId: 'prof-cobrador-1', notes: 'Excelente historial crediticio, préstamo cancelado', active: true, createdAt: '2026-08-15' },
      { id: 'cli-6', dni: '40123456', fullName: 'Elena Morales', phone: '996677889', address: 'Jr. Ayacucho 315, Trujillo', addressReference: 'Librería El Sol', collectorId: 'prof-cobrador-1', notes: 'Realizó abono parcial ayer', active: true, createdAt: '2026-09-12' },
      { id: 'cli-7', dni: '41234567', fullName: 'Fernando Silva', phone: '997788990', address: 'Av. Miraflores 440, Trujillo', addressReference: 'Panadería La Espiga', collectorId: 'prof-cobrador-2', notes: 'Puntual', active: true, createdAt: '2026-09-15' },
      { id: 'cli-8', dni: '42345678', fullName: 'Lucía Díaz', phone: '998899001', address: 'Ca. Los Cedros 123, Trujillo', addressReference: 'Mz B Lote 4', collectorId: 'prof-cobrador-2', notes: 'Atraso de 2 cuotas por viaje', active: true, createdAt: '2026-09-10' }
    ];

    const loans: Loan[] = [
      { id: 'loan-1', clientId: 'cli-1', collectorId: 'prof-cobrador-1', principal: 200, interestRate: 20, interestAmount: 40, totalAmount: 240, installmentAmount: 10, frequency: 'DIARIO', numberOfInstallments: 24, startDate: '2026-09-15', endDate: '2026-10-16', balance: 150, status: 'ACTIVE', createdAt: '2026-09-15' },
      { id: 'loan-2', clientId: 'cli-2', collectorId: 'prof-cobrador-1', principal: 300, interestRate: 20, interestAmount: 60, totalAmount: 360, installmentAmount: 15, frequency: 'DIARIO', numberOfInstallments: 24, startDate: '2026-09-15', endDate: '2026-10-16', balance: 300, status: 'ACTIVE', createdAt: '2026-09-15' },
      { id: 'loan-3', clientId: 'cli-3', collectorId: 'prof-cobrador-1', principal: 400, interestRate: 20, interestAmount: 80, totalAmount: 480, installmentAmount: 20, frequency: 'DIARIO', numberOfInstallments: 24, startDate: '2026-09-10', endDate: '2026-10-13', balance: 420, status: 'ACTIVE', createdAt: '2026-09-10' },
      { id: 'loan-4', clientId: 'cli-4', collectorId: 'prof-cobrador-1', principal: 500, interestRate: 20, interestAmount: 100, totalAmount: 600, installmentAmount: 20, frequency: 'DIARIO', numberOfInstallments: 30, startDate: '2026-09-01', endDate: '2026-10-12', balance: 500, status: 'ACTIVE', createdAt: '2026-09-01' },
      { id: 'loan-5', clientId: 'cli-5', collectorId: 'prof-cobrador-1', principal: 200, interestRate: 20, interestAmount: 40, totalAmount: 240, installmentAmount: 10, frequency: 'DIARIO', numberOfInstallments: 24, startDate: '2026-08-20', endDate: '2026-09-22', balance: 0, status: 'PAID', createdAt: '2026-08-20' },
      { id: 'loan-6', clientId: 'cli-6', collectorId: 'prof-cobrador-1', principal: 200, interestRate: 20, interestAmount: 40, totalAmount: 240, installmentAmount: 10, frequency: 'DIARIO', numberOfInstallments: 24, startDate: '2026-09-21', endDate: '2026-10-22', balance: 234, status: 'ACTIVE', createdAt: '2026-09-21' },
      { id: 'loan-7', clientId: 'cli-7', collectorId: 'prof-cobrador-2', principal: 250, interestRate: 20, interestAmount: 50, totalAmount: 300, installmentAmount: 15, frequency: 'DIARIO', numberOfInstallments: 20, startDate: '2026-09-21', endDate: '2026-10-16', balance: 210, status: 'ACTIVE', createdAt: '2026-09-21' },
      { id: 'loan-8', clientId: 'cli-8', collectorId: 'prof-cobrador-2', principal: 300, interestRate: 20, interestAmount: 60, totalAmount: 360, installmentAmount: 15, frequency: 'DIARIO', numberOfInstallments: 24, startDate: '2026-09-18', endDate: '2026-10-21', balance: 330, status: 'ACTIVE', createdAt: '2026-09-18' }
    ];

    let loanInstallments: Installment[] = [];
    loans.forEach(l => {
      const insts = this.generateSchedule(l);
      loanInstallments = loanInstallments.concat(insts);
    });

    const payments: Payment[] = [
      { id: 'pay-1', loanId: 'loan-1', clientId: 'cli-1', collectorId: 'prof-cobrador-1', amount: 50, date: '2026-09-20', notes: 'Abono 5 cuotas', createdBy: 'prof-cobrador-1', createdAt: '2026-09-20T12:00:00Z' },
      { id: 'pay-2', loanId: 'loan-1', clientId: 'cli-1', collectorId: 'prof-cobrador-1', amount: 40, date: '2026-09-25', notes: 'Abono 4 cuotas', createdBy: 'prof-cobrador-1', createdAt: '2026-09-25T12:00:00Z' },
      { id: 'pay-3', loanId: 'loan-2', clientId: 'cli-2', collectorId: 'prof-cobrador-1', amount: 60, date: '2026-09-22', notes: 'Pago inicial 4 cuotas', createdBy: 'prof-cobrador-1', createdAt: '2026-09-22T12:00:00Z' },
      { id: 'pay-4', loanId: 'loan-3', clientId: 'cli-3', collectorId: 'prof-cobrador-1', amount: 60, date: '2026-09-18', notes: 'Pago semana 1', createdBy: 'prof-cobrador-1', createdAt: '2026-09-18T12:00:00Z' },
      { id: 'pay-5', loanId: 'loan-4', clientId: 'cli-4', collectorId: 'prof-cobrador-1', amount: 100, date: '2026-09-08', notes: 'Abono primeras cuotas', createdBy: 'prof-cobrador-1', createdAt: '2026-09-08T12:00:00Z' },
      { id: 'pay-6', loanId: 'loan-5', clientId: 'cli-5', collectorId: 'prof-cobrador-1', amount: 240, date: '2026-09-15', notes: 'Cancelación total anticipada', createdBy: 'prof-cobrador-1', createdAt: '2026-09-15T12:00:00Z' },
      { id: 'pay-7', loanId: 'loan-6', clientId: 'cli-6', collectorId: 'prof-cobrador-1', amount: 6, date: '2026-09-22', notes: 'Abono parcial cuota 1', createdBy: 'prof-cobrador-1', createdAt: '2026-09-22T12:00:00Z' },
      { id: 'pay-8', loanId: 'loan-7', clientId: 'cli-7', collectorId: 'prof-cobrador-2', amount: 90, date: '2026-09-28', notes: 'Al día', createdBy: 'prof-cobrador-2', createdAt: '2026-09-28T12:00:00Z' },
      { id: 'pay-9', loanId: 'loan-8', clientId: 'cli-8', collectorId: 'prof-cobrador-2', amount: 30, date: '2026-09-22', notes: 'Abono inicial', createdBy: 'prof-cobrador-2', createdAt: '2026-09-22T12:00:00Z' }
    ];

    payments.forEach(p => {
      let unallocated = p.amount;
      const insts = loanInstallments.filter(i => i.loanId === p.loanId).sort((a,b) => a.installmentNumber - b.installmentNumber);
      for (let inst of insts) {
        if (unallocated <= 0) break;
        if (inst.status === 'PAGADO') continue;
        if (unallocated >= inst.remainingAmount) {
          unallocated -= inst.remainingAmount;
          inst.paidAmount += inst.remainingAmount;
          inst.remainingAmount = 0;
          inst.status = 'PAGADO';
        } else {
          inst.paidAmount += unallocated;
          inst.remainingAmount -= unallocated;
          inst.status = 'PAGO_PARCIAL';
          unallocated = 0;
        }
      }
    });

    const auditLogs: AuditLog[] = [
      { id: 'aud-1', userId: 'prof-admin', userName: 'Carlos Mendoza', action: 'CREAR_PRESTAMO', entity: 'loans', entityId: 'loan-1', details: 'Préstamo creado por S/ 200 para Juan Pérez', createdAt: '2026-09-15 08:30:00' },
      { id: 'aud-2', userId: 'prof-cobrador-1', userName: 'Pedro Castillo', action: 'REGISTRAR_PAGO', entity: 'payments', entityId: 'pay-2', details: 'Pago registrado por S/ 40.00 para Juan Pérez', createdAt: '2026-09-25 10:15:00' }
    ];

    return { profiles, clients, loans, loanInstallments, payments, auditLogs };
  }
}
