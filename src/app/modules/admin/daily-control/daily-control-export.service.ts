import { Service } from '@angular/core';
import { formatEsDate, parseDateValue } from '../../../core/calculations/date-time';
import { formatPen } from '../../../shared/pipes/pen-currency';
import {
  DailyControlExportContext,
  DailyControlExportFormat,
  DailyControlReport,
  DailyControlRow,
  DailyControlStatus,
} from '../../../core/models/daily-control.model';

const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@Service()
export class DailyControlExportService {
  async export(
    format: DailyControlExportFormat,
    report: DailyControlReport,
    context: DailyControlExportContext,
  ): Promise<void> {
    if (report.rows.length === 0) {
      throw new Error('No hay filas para exportar con los filtros actuales.');
    }

    if (format === 'csv') {
      this.downloadBlob(
        new Blob([toDailyControlCsv(report.rows)], { type: 'text/csv;charset=utf-8' }),
        this.fileName(report.filters.businessDate, 'csv'),
      );
      return;
    }

    if (format === 'xlsx') {
      await this.exportExcel(report, context);
      return;
    }

    await this.exportPdf(report, context);
  }

  private async exportExcel(
    report: DailyControlReport,
    context: DailyControlExportContext,
  ): Promise<void> {
    const { Workbook } = await import('exceljs');
    const workbook = new Workbook();
    workbook.creator = 'CobranzaPro';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Control diario', {
      views: [{ state: 'frozen', ySplit: 5 }],
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
    });

    worksheet.mergeCells('A1:O1');
    worksheet.getCell('A1').value = 'CobranzaPro - Control diario';
    worksheet.getCell('A1').font = { bold: true, size: 18, color: { argb: 'FF1D4ED8' } };
    worksheet.getCell('A2').value = 'Fecha de corte';
    worksheet.getCell('B2').value = parseDateValue(report.filters.businessDate);
    worksheet.getCell('B2').numFmt = 'dd/mm/yyyy';
    worksheet.getCell('D2').value = 'Cobrador';
    worksheet.getCell('E2').value = context.collectorLabel;
    worksheet.getCell('G2').value = 'Generado por';
    worksheet.getCell('H2').value = context.generatedBy;
    worksheet.getCell('J2').value = 'Registros';
    worksheet.getCell('K2').value = report.rows.length;
    if (context.searchQuery) {
      worksheet.getCell('A3').value = 'Búsqueda aplicada';
      worksheet.getCell('B3').value = context.searchQuery;
    }

    worksheet.columns = [
      { header: 'Cliente', key: 'clientName', width: 25 },
      { header: 'DNI', key: 'clientDni', width: 13 },
      { header: 'Cobrador', key: 'collectorName', width: 22 },
      { header: 'Inicio', key: 'startedOn', width: 12 },
      { header: 'Fin', key: 'endDate', width: 12 },
      { header: 'Capital', key: 'principalAmount', width: 13 },
      { header: 'Total', key: 'totalAmount', width: 13 },
      { header: 'Cuota', key: 'installmentAmount', width: 12 },
      { header: 'Programado día', key: 'scheduledOnDate', width: 16 },
      { header: 'Cobrado día', key: 'collectedOnDate', width: 15 },
      { header: 'Pagado al corte', key: 'paidToDate', width: 16 },
      { header: 'Saldo al corte', key: 'balanceAsOf', width: 16 },
      { header: 'Cuota impaga más antigua', key: 'oldestUnpaidDueDate', width: 23 },
      { header: 'Días de atraso', key: 'overdueDays', width: 15 },
      { header: 'Estado', key: 'status', width: 13 },
    ];

    const headerRow = worksheet.getRow(5);
    headerRow.values = [
      'Cliente',
      'DNI',
      'Cobrador',
      'Inicio',
      'Fin',
      'Capital',
      'Total',
      'Cuota',
      'Programado día',
      'Cobrado día',
      'Pagado al corte',
      'Saldo al corte',
      'Cuota impaga más antigua',
      'Días de atraso',
      'Estado',
    ];
    headerRow.height = 24;
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    headerRow.alignment = { vertical: 'middle' };
    worksheet.autoFilter = { from: 'A5', to: 'O5' };

    for (const row of report.rows) {
      worksheet.addRow({
        ...row,
        startedOn: parseDateValue(row.startedOn),
        endDate: parseDateValue(row.endDate),
        oldestUnpaidDueDate: row.oldestUnpaidDueDate ? parseDateValue(row.oldestUnpaidDueDate) : null,
        status: statusLabel(row.status),
      });
    }

    for (let index = 6; index <= worksheet.rowCount; index++) {
      const row = worksheet.getRow(index);
      for (const column of [4, 5, 13]) row.getCell(column).numFmt = 'dd/mm/yyyy';
      for (const column of [6, 7, 8, 9, 10, 11, 12]) row.getCell(column).numFmt = '"S/" #,##0.00';
      if (index % 2 === 0) {
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      }
    }

    const totalRow = worksheet.addRow({
      clientName: 'Totales',
      scheduledOnDate: report.summary.scheduledAmount,
      collectedOnDate: report.summary.collectedAmount,
      balanceAsOf: report.rows.reduce((total, row) => total + row.balanceAsOf, 0),
      status: `${report.summary.overdueClients} con atraso`,
    });
    totalRow.font = { bold: true };
    for (const column of [9, 10, 12]) totalRow.getCell(column).numFmt = '"S/" #,##0.00';

    const buffer = await workbook.xlsx.writeBuffer();
    const bytes = new Uint8Array(buffer as ArrayBuffer);
    this.downloadBlob(
      new Blob([bytes], { type: MIME_XLSX }),
      this.fileName(report.filters.businessDate, 'xlsx'),
    );
  }

  private async exportPdf(
    report: DailyControlReport,
    context: DailyControlExportContext,
  ): Promise<void> {
    const [{ jsPDF }, { autoTable }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ]);
    const document = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

    document.setTextColor(29, 78, 216);
    document.setFontSize(17);
    document.text('CobranzaPro - Control diario', 40, 38);
    document.setTextColor(71, 85, 105);
    document.setFontSize(9);
    document.text(`Fecha de corte: ${formatEsDate(report.filters.businessDate, 'long')}`, 40, 56);
    document.text(`Cobrador: ${context.collectorLabel}`, 205, 56);
    document.text(`Generado por: ${context.generatedBy}`, 430, 56);
    document.text(`Registros: ${report.rows.length}`, 700, 56);
    if (context.searchQuery) {
      document.text(`Búsqueda: ${context.searchQuery}`, 40, 70);
    }

    autoTable(document, {
      startY: context.searchQuery ? 82 : 70,
      margin: { left: 26, right: 26 },
      theme: 'grid',
      styles: { fontSize: 6.7, cellPadding: 3.5, textColor: [30, 41, 59] },
      headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      head: [[
        'Cliente', 'DNI', 'Cobrador', 'Inicio', 'Fin', 'Capital', 'Total', 'Cuota',
        'Prog. día', 'Cobrado día', 'Pagado', 'Saldo', 'Cuota impaga', 'Atraso', 'Estado',
      ]],
      body: report.rows.map((row) => [
        row.clientName,
        row.clientDni,
        row.collectorName,
        formatEsDate(row.startedOn, 'short'),
        formatEsDate(row.endDate, 'short'),
        formatPen(row.principalAmount),
        formatPen(row.totalAmount),
        formatPen(row.installmentAmount),
        formatPen(row.scheduledOnDate),
        formatPen(row.collectedOnDate),
        formatPen(row.paidToDate),
        formatPen(row.balanceAsOf),
        row.oldestUnpaidDueDate ? formatEsDate(row.oldestUnpaidDueDate, 'short') : '-',
        `${row.overdueDays} d`,
        statusLabel(row.status),
      ]),
      foot: [[
        'Totales', '', '', '', '', '', '', '', formatPen(report.summary.scheduledAmount),
        formatPen(report.summary.collectedAmount), '', formatPen(report.rows.reduce((total, row) => total + row.balanceAsOf, 0)),
        '', '', `${report.summary.overdueClients} con atraso`,
      ]],
      footStyles: { fillColor: [226, 232, 240], textColor: [15, 23, 42], fontStyle: 'bold' },
    });

    const pageCount = document.getNumberOfPages();
    for (let page = 1; page <= pageCount; page++) {
      document.setPage(page);
      document.setFontSize(8);
      document.setTextColor(100, 116, 139);
      document.text(`Página ${page} de ${pageCount}`, 760, 575);
    }

    document.save(this.fileName(report.filters.businessDate, 'pdf'));
  }

  private fileName(businessDate: string, extension: DailyControlExportFormat): string {
    return `control-diario_${businessDate}.${extension}`;
  }

  private downloadBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }
}

export function toDailyControlCsv(rows: DailyControlRow[]): string {
  const headers = [
    'Cliente', 'DNI', 'Cobrador', 'Fecha inicio', 'Fecha fin', 'Capital', 'Total a pagar',
    'Cuota', 'Programado del día', 'Cobrado del día', 'Pagado al corte', 'Saldo al corte',
    'Cuota impaga más antigua', 'Días de atraso', 'Estado',
  ];
  const values = rows.map((row) => [
    row.clientName,
    row.clientDni,
    row.collectorName,
    row.startedOn,
    row.endDate,
    row.principalAmount.toFixed(2),
    row.totalAmount.toFixed(2),
    row.installmentAmount.toFixed(2),
    row.scheduledOnDate.toFixed(2),
    row.collectedOnDate.toFixed(2),
    row.paidToDate.toFixed(2),
    row.balanceAsOf.toFixed(2),
    row.oldestUnpaidDueDate ?? '',
    row.overdueDays.toString(),
    statusLabel(row.status),
  ]);

  return `\uFEFF${[headers, ...values].map((row) => row.map(csvCell).join(';')).join('\r\n')}\r\n`;
}

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function statusLabel(status: DailyControlStatus): string {
  return { on_track: 'Al día', overdue: 'Con atraso', paid: 'Pagado' }[status];
}
