import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { prisma } from '../../infrastructure/database/prisma.client';

export class WorkRequestDocumentService {
  static async generateSTDocument(workRequestId: string): Promise<Buffer> {
    const wr = await prisma.workRequest.findUnique({
      where: { id: workRequestId },
      include: {
        organization: true,
        aircraft: true,
        responsible: true,
        items: { include: { task: true, component: true, discrepancy: true }, orderBy: { addedAt: 'asc' } },
      },
    });

    if (!wr) {
      throw new Error('Work request not found');
    }

    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));

    doc.font('Helvetica-Bold').fontSize(18).text('SOLICITUD DE TRABAJO');
    doc.moveDown(0.2);
    doc.font('Helvetica').fontSize(10).text(wr.organization.name);
    doc.moveTo(48, 84).lineTo(548, 84).stroke();

    doc.font('Helvetica-Bold').fontSize(10).text('Solicitud Nro:', 48, 96);
    doc.font('Helvetica').text(wr.number, 130, 96);

    doc.font('Helvetica-Bold').text('Fecha:', 320, 96);
    doc.font('Helvetica').text(wr.createdAt.toLocaleDateString('es-MX'), 360, 96);

    doc.font('Helvetica-Bold').text('Responsable:', 48, 114);
    doc.font('Helvetica').text(wr.responsible?.name ?? 'No asignado', 130, 114);

    doc.font('Helvetica-Bold').fontSize(11).text('AERONAVE', 48, 146);
    doc.moveTo(48, 162).lineTo(548, 162).stroke();

    doc.font('Helvetica-Bold').fontSize(10).text('Matrícula:', 48, 176);
    doc.font('Helvetica').text(wr.aircraft.registration, 130, 176);

    doc.font('Helvetica-Bold').text('Marca/Modelo:', 260, 176);
    doc.font('Helvetica').text(`${wr.aircraft.manufacturer} ${wr.aircraft.model}`, 350, 176, { width: 190 });

    doc.font('Helvetica-Bold').text('Horas Totales:', 48, 194);
    doc.font('Helvetica').text(
      (wr.aircraftHoursAtRequest ?? Number(wr.aircraft.totalFlightHours)).toString(),
      130,
      194,
    );

    doc.font('Helvetica-Bold').text('Ciclos N1 / N2:', 260, 194);
    doc.font('Helvetica').text(
      `${wr.aircraftCyclesN1 ?? wr.aircraft.totalCycles} / ${wr.aircraftCyclesN2 ?? '-'}`,
      350,
      194,
    );

    const categoryLabels: Record<string, string> = {
      MAINTENANCE_PLAN: 'Plan de Mantenimiento',
      NORMATIVE: 'Normativa',
      COMPONENT_INSPECTION: 'Componentes e Inspecciones',
      DISCREPANCY: 'Discrepancias',
      OTHER: 'Otros',
    };

    let y = 230;
    doc.font('Helvetica-Bold').fontSize(11).text('ITEMS INCLUIDOS', 48, y);
    y += 14;
    doc.moveTo(48, y).lineTo(548, y).stroke();
    y += 12;

    const grouped = wr.items.reduce<Record<string, typeof wr.items>>((acc, item) => {
      acc[item.category] ??= [];
      acc[item.category].push(item);
      return acc;
    }, {});

    Object.entries(grouped).forEach(([category, items]) => {
      if (y > 700) {
        doc.addPage();
        y = 48;
      }

      doc.font('Helvetica-Bold').fontSize(10).text(categoryLabels[category] ?? category, 48, y);
      y += 16;

      items.forEach((item, idx) => {
        if (y > 730) {
          doc.addPage();
          y = 48;
        }

        const dueParts: string[] = [];
        if (item.task?.intervalHours != null) dueParts.push(`${item.task.intervalHours}h`);
        if (item.task?.intervalCalendarDays != null) dueParts.push(`${item.task.intervalCalendarDays}d`);
        if (item.task?.intervalCycles != null) dueParts.push(`${item.task.intervalCycles} cic`);

        doc.font('Helvetica-Bold').fontSize(9).text(`${idx + 1}. ${item.itemCode ?? '-'}`, 50, y);
        doc.font('Helvetica').fontSize(9).text(item.itemTitle, 145, y, { width: 280 });
        doc.text(dueParts.join(' / ') || item.source || '-', 450, y, { width: 90, align: 'right' });
        y += 14;
        if (item.itemDescription) {
          doc.fontSize(8).fillColor('#6b7280').text(item.itemDescription, 66, y, { width: 470, lineGap: 1 });
          doc.fillColor('#000000');
          y += 18;
        }
        y += 4;
      });

      y += 6;
    });

    if (wr.notes) {
      if (y > 690) {
        doc.addPage();
        y = 48;
      }
      doc.font('Helvetica-Bold').fontSize(10).text('Observaciones', 48, y);
      y += 14;
      doc.font('Helvetica').fontSize(9).text(wr.notes, 48, y, { width: 500 });
    }

    doc.end();

    return new Promise((resolve, reject) => {
      doc.on('finish', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });
  }

  static async savePdfToFile(pdfBuffer: Buffer, filename: string): Promise<string> {
    const tmpDir = path.join(process.cwd(), 'tmp', 'pdfs');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const filePath = path.join(tmpDir, filename);
    fs.writeFileSync(filePath, pdfBuffer);
    return filePath;
  }
}
