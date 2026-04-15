import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * PDFGenerationService
 * Genera PDFs de órdenes de trabajo para impresión y correo
 */
export class PDFGenerationService {
  /**
   * Generar PDF de Work Order
   * Incluye: datos de aeronave, tareas, áreas de firma
   */
  static async generateWorkOrderPdf(workOrderId: string): Promise<Buffer> {
    // Obtener datos completos de la OT
    const workOrder = await prisma.workOrder.findUnique({
      where: { id: workOrderId },
      include: {
        aircraft: true,
        assignedTechnician: true,
        tasks: {
          include: { task: true },
        },
        organization: true,
      },
    });

    if (!workOrder) {
      throw new Error('Work Order not found');
    }

    // Crear documento PDF
    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
    });

    // Buffer para capturar el PDF generado
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));

    // Header con logo y título
    doc.fontSize(20).font('Helvetica-Bold').text('ORDEN DE TRABAJO', 100);
    doc.fontSize(10).font('Helvetica').text(`${workOrder.organization.name}`, 100);

    doc.moveTo(50, 80).lineTo(550, 80).stroke();

    // Número y fechas
    doc.fontSize(11).font('Helvetica-Bold').text('Número de OT:', 50, 95);
    doc.fontSize(11).font('Helvetica').text(workOrder.number, 150, 95);

    doc.fontSize(11).font('Helvetica-Bold').text('Fecha Creación:', 50, 115);
    doc.fontSize(11).font('Helvetica').text(workOrder.createdAt.toLocaleDateString(), 150, 115);

    doc.fontSize(11).font('Helvetica-Bold').text('Fecha Límite:', 350, 115);
    doc.fontSize(11).font('Helvetica').text(
      workOrder.plannedEndDate ? workOrder.plannedEndDate.toLocaleDateString() : 'N/A',
      450, 115
    );

    // Sección: Aeronave
    doc.fontSize(12).font('Helvetica-Bold').text('INFORMACIÓN DE AERONAVE', 50, 145);
    doc.moveTo(50, 160).lineTo(550, 160).stroke();

    let yPos = 175;
    doc.fontSize(10).font('Helvetica-Bold').text('Matrícula:', 50, yPos);
    doc.fontSize(10).font('Helvetica').text(workOrder.aircraft.registration, 150, yPos);

    doc.fontSize(10).font('Helvetica-Bold').text('Modelo:', 300, yPos);
    doc.fontSize(10).font('Helvetica').text(workOrder.aircraft.model, 400, yPos);

    yPos += 25;
    doc.fontSize(10).font('Helvetica-Bold').text('Horas Totales:', 50, yPos);
    doc.fontSize(10).font('Helvetica').text(workOrder.aircraft.totalFlightHours.toString(), 150, yPos);

    doc.fontSize(10).font('Helvetica-Bold').text('Ciclos:', 300, yPos);
    doc.fontSize(10).font('Helvetica').text(workOrder.aircraft.totalCycles.toString(), 400, yPos);

    // Sección: Tareas
    yPos += 40;
    doc.fontSize(12).font('Helvetica-Bold').text('TAREAS A REALIZAR', 50, yPos);
    doc.moveTo(50, yPos + 15).lineTo(550, yPos + 15).stroke();

    yPos += 30;
    const tasksPerPage = 10;
    const tasks = workOrder.tasks;

    for (let i = 0; i < Math.min(tasks.length, tasksPerPage); i++) {
      const task = tasks[i].task;
      doc.fontSize(9).font('Helvetica').text(`${i + 1}. ${task.title}`, 60, yPos);
      if (task.description) {
        doc.fontSize(8).font('Helvetica').text(task.description, 65, yPos + 12, {
          width: 470,
        });
      }
      yPos += 30;
    }

    // Sección: Técnico Asignado
    if (workOrder.assignedTechnician) {
      yPos += 20;
      doc.fontSize(12).font('Helvetica-Bold').text('TÉCNICO ASIGNADO', 50, yPos);
      doc.moveTo(50, yPos + 15).lineTo(550, yPos + 15).stroke();

      yPos += 30;
      doc.fontSize(10).font('Helvetica-Bold').text('Nombre:', 50, yPos);
      doc.fontSize(10).font('Helvetica').text(workOrder.assignedTechnician.name, 150, yPos);

      yPos += 20;
      doc.fontSize(10).font('Helvetica-Bold').text('Email:', 50, yPos);
      doc.fontSize(10).font('Helvetica').text(workOrder.assignedTechnician.email, 150, yPos);
    }

    // Sección: Firmas
    yPos += 50;
    doc.fontSize(12).font('Helvetica-Bold').text('FIRMAS Y APROBACIONES', 50, yPos);
    doc.moveTo(50, yPos + 15).lineTo(550, yPos + 15).stroke();

    yPos += 40;
    doc.fontSize(9).font('Helvetica').text('Firma del Técnico:', 50, yPos);
    doc.moveTo(50, yPos + 25).lineTo(200, yPos + 25).stroke();

    doc.fontSize(9).font('Helvetica').text('Firma del Supervisor:', 300, yPos);
    doc.moveTo(300, yPos + 25).lineTo(450, yPos + 25).stroke();

    yPos += 40;
    doc.fontSize(9).font('Helvetica').text('Fecha:', 50, yPos);
    doc.moveTo(50, yPos + 15).lineTo(150, yPos + 15).stroke();

    doc.fontSize(9).font('Helvetica').text('Fecha:', 300, yPos);
    doc.moveTo(300, yPos + 15).lineTo(400, yPos + 15).stroke();

    // Footer
    doc
      .fontSize(8)
      .font('Helvetica')
      .text('Este documento es parte del programa de mantenimiento formativo.', 50, 750, {
        align: 'center',
      });

    doc.end();

    // Esperar a que se complete el PDF
    return new Promise((resolve, reject) => {
      doc.on('finish', () => {
        resolve(Buffer.concat(chunks));
      });
      doc.on('error', reject);
    });
  }

  /**
   * Guardar PDF a archivo temporal
   */
  static async savePdfToFile(pdfBuffer: Buffer, filename: string): Promise<string> {
    const tmpDir = path.join(process.cwd(), 'tmp', 'pdfs');

    // Crear directorio si no existe
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    const filePath = path.join(tmpDir, filename);
    fs.writeFileSync(filePath, pdfBuffer);

    return filePath;
  }

  /**
   * Obtener ruta del archivo PDF
   */
  static getPdfPath(workOrderId: string): string {
    const filename = `WO-${workOrderId}-${Date.now()}.pdf`;
    return path.join(process.cwd(), 'tmp', 'pdfs', filename);
  }

  /**
   * Limpiar archivos PDF temporales más antiguos de 24 horas
   */
  static async cleanupOldPdfs(): Promise<void> {
    const pdfDir = path.join(process.cwd(), 'tmp', 'pdfs');

    if (!fs.existsSync(pdfDir)) {
      return;
    }

    const files = fs.readdirSync(pdfDir);
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 horas

    for (const file of files) {
      const filePath = path.join(pdfDir, file);
      const stat = fs.statSync(filePath);
      const age = now - stat.mtimeMs;

      if (age > maxAge) {
        fs.unlinkSync(filePath);
      }
    }
  }
}
