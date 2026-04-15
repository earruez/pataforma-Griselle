import nodemailer from 'nodemailer';
import { env } from '../../config/env';

/**
 * EmailService
 * Maneja envío de notificaciones por correo para OT
 */
export class EmailService {
  private static transporter: nodemailer.Transporter;

  /**
   * Inicializar transporte SMTP
   */
  static initialize() {
    if (env.email.provider === 'smtp') {
      this.transporter = nodemailer.createTransport({
        host: env.email.smtpHost,
        port: env.email.smtpPort,
        secure: env.email.smtpSecure,
        auth: {
          user: env.email.smtpUser,
          pass: env.email.smtpPass,
        },
      });
    } else if (env.email.provider === 'sendgrid') {
      // Usar plugin de Sendgrid si está disponible
      this.transporter = nodemailer.createTransport({
        host: 'smtp.sendgrid.net',
        port: 587,
        auth: {
          user: 'apikey',
          pass: env.email.sendgridApiKey,
        },
      });
    }
  }

  /**
   * Enviar notificación de asignación de OT a técnico
   */
  static async sendWorkOrderAssignmentNotification(
    technicianEmail: string,
    technicianName: string,
    workOrderNumber: string,
    aircraftRegistration: string,
    aircraftModel: string,
    plannedDate: Date,
    pdfAttachmentPath?: string
  ): Promise<void> {
    if (!this.transporter) {
      this.initialize();
    }

    const subject = `Nueva Orden de Trabajo Asignada: ${workOrderNumber}`;

    const htmlContent = `
      <html>
        <body style="font-family: Arial, sans-serif; color: #333;">
          <h2>Hola ${technicianName},</h2>
          
          <p>Se te ha asignado una nueva orden de trabajo.</p>
          
          <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <h3>Detalles de la Orden de Trabajo</h3>
            <p><strong>Número OT:</strong> ${workOrderNumber}</p>
            <p><strong>Aeronave:</strong> ${aircraftRegistration} (${aircraftModel})</p>
            <p><strong>Fecha Programada:</strong> ${plannedDate.toLocaleDateString()}</p>
          </div>
          
          <p>Por favor, accede a la plataforma para revisar los detalles completos de las tareas asignadas.</p>
          
          <p>Si tienes preguntas, contacta a tu supervisor.</p>
          
          <p>Saludos,<br/>Sistema de Gestión de Mantenimiento</p>
        </body>
      </html>
    `;

    const mailOptions: nodemailer.SendMailOptions = {
      from: env.email.fromAddress,
      to: technicianEmail,
      subject,
      html: htmlContent,
      attachments: pdfAttachmentPath
        ? [
            {
              filename: `OT-${workOrderNumber}.pdf`,
              path: pdfAttachmentPath,
            },
          ]
        : undefined,
    };

    try {
      await this.transporter.sendMail(mailOptions);
    } catch (error) {
      console.error('Error sending work order assignment email:', error);
      // No lanzar error: el sistema debe continuar aunque falle el email
    }
  }

  /**
   * Enviar notificación de requerimiento de evidencia
   */
  static async sendEvidenceRequiredNotification(
    technicianEmail: string,
    technicianName: string,
    workOrderNumber: string,
    aircraftRegistration: string
  ): Promise<void> {
    if (!this.transporter) {
      this.initialize();
    }

    const subject = `Requerida Evidencia Fotográfica: ${workOrderNumber}`;

    const htmlContent = `
      <html>
        <body style="font-family: Arial, sans-serif; color: #333;">
          <h2>Hola ${technicianName},</h2>
          
          <p>Tu supervisor requiere que cargues evidencia fotográfica para completar la orden de trabajo.</p>
          
          <div style="background-color: #fff3cd; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p><strong>Orden de Trabajo:</strong> ${workOrderNumber}</p>
            <p><strong>Aeronave:</strong> ${aircraftRegistration}</p>
            <p><strong>Requerimiento:</strong> Carga al menos una foto del trabajo completado.</p>
          </div>
          
          <p>Accede a la plataforma para cargar la evidencia.</p>
          
          <p>Saludos,<br/>Sistema de Gestión de Mantenimiento</p>
        </body>
      </html>
    `;

    const mailOptions: nodemailer.SendMailOptions = {
      from: env.email.fromAddress,
      to: technicianEmail,
      subject,
      html: htmlContent,
    };

    try {
      await this.transporter.sendMail(mailOptions);
    } catch (error) {
      console.error('Error sending evidence notification email:', error);
    }
  }

  /**
   * Enviar notificación de cierre de OT a supervisor
   */
  static async sendWorkOrderClosedNotification(
    supervisorEmail: string,
    supervisorName: string,
    workOrderNumber: string,
    aircraftRegistration: string,
    technicianName: string
  ): Promise<void> {
    if (!this.transporter) {
      this.initialize();
    }

    const subject = `Orden de Trabajo Completada: ${workOrderNumber}`;

    const htmlContent = `
      <html>
        <body style="font-family: Arial, sans-serif; color: #333;">
          <h2>Hola ${supervisorName},</h2>
          
          <p>Una orden de trabajo ha sido completada y cerrada.</p>
          
          <div style="background-color: #d4edda; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p><strong>Número OT:</strong> ${workOrderNumber}</p>
            <p><strong>Aeronave:</strong> ${aircraftRegistration}</p>
            <p><strong>Técnico:</strong> ${technicianName}</p>
            <p><strong>Estado:</strong> Completada y cerrada</p>
          </div>
          
          <p>Los registros de cumplimiento se han actualizado automáticamente.</p>
          
          <p>Saludos,<br/>Sistema de Gestión de Mantenimiento</p>
        </body>
      </html>
    `;

    const mailOptions: nodemailer.SendMailOptions = {
      from: env.email.fromAddress,
      to: supervisorEmail,
      subject,
      html: htmlContent,
    };

    try {
      await this.transporter.sendMail(mailOptions);
    } catch (error) {
      console.error('Error sending work order closed email:', error);
    }
  }

  /**
   * Enviar alerta a supervisores de OT pendientes de asignación
   */
  static async sendPendingAssignmentAlert(
    supervisorEmail: string,
    supervisorName: string,
    pendingCount: number
  ): Promise<void> {
    if (!this.transporter) {
      this.initialize();
    }

    const subject = `Alerta: ${pendingCount} Orden(es) de Trabajo Pendiente(s) de Asignación`;

    const htmlContent = `
      <html>
        <body style="font-family: Arial, sans-serif; color: #333;">
          <h2>Hola ${supervisorName},</h2>
          
          <p>Tienes ${pendingCount} orden(s) de trabajo que requieren asignación de técnico.</p>
          
          <div style="background-color: #ffe0e0; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p><strong>Acción Requerida:</strong> Asignar técnico(s) a las órdenes pendientes.</p>
          </div>
          
          <p>Accede a la plataforma para completar las asignaciones.</p>
          
          <p>Saludos,<br/>Sistema de Gestión de Mantenimiento</p>
        </body>
      </html>
    `;

    const mailOptions: nodemailer.SendMailOptions = {
      from: env.email.fromAddress,
      to: supervisorEmail,
      subject,
      html: htmlContent,
    };

    try {
      await this.transporter.sendMail(mailOptions);
    } catch (error) {
      console.error('Error sending pending assignment alert email:', error);
    }
  }

  static async sendWorkRequestNotification(input: {
    to: string;
    responsibleName: string;
    workRequestNumber: string;
    aircraftRegistration: string;
    aircraftModel: string;
    pdfAttachmentPath: string;
  }): Promise<void> {
    if (!this.transporter) {
      this.initialize();
    }

    const subject = `Solicitud de Trabajo ${input.workRequestNumber}`;
    const htmlContent = `
      <html>
        <body style="font-family: Arial, sans-serif; color: #333;">
          <h2>Hola ${input.responsibleName},</h2>
          <p>Se ha generado una Solicitud de Trabajo para la aeronave ${input.aircraftRegistration}.</p>
          <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p><strong>Solicitud:</strong> ${input.workRequestNumber}</p>
            <p><strong>Aeronave:</strong> ${input.aircraftRegistration} (${input.aircraftModel})</p>
          </div>
          <p>Adjunto encontrarás el PDF con las tareas agrupadas para despacho.</p>
          <p>Saludos,<br/>Sistema de Gestión de Mantenimiento</p>
        </body>
      </html>
    `;

    await this.transporter.sendMail({
      from: env.email.fromAddress,
      to: input.to,
      subject,
      html: htmlContent,
      attachments: [
        {
          filename: `${input.workRequestNumber}.pdf`,
          path: input.pdfAttachmentPath,
        },
      ],
    });
  }

  /**
   * Probar conexión SMTP
   */
  static async testConnection(): Promise<boolean> {
    if (!this.transporter) {
      this.initialize();
    }

    try {
      await this.transporter.verify();
      return true;
    } catch (error) {
      console.error('Email service connection failed:', error);
      return false;
    }
  }
}
