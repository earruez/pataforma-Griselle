import { PrismaClient, Prisma, TaskIntervalType } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * TemplateCloneService
 * Handles cloning maintenance tasks from a template to a newly created aircraft
 */
export class TemplateCloneService {
  /**
   * Clone all tasks from a template to a new aircraft
   *
   * @param templateId - ID of the maintenance template
   * @param aircraftId - ID of the newly created aircraft
   * @param organizationId - Organization context
   * @returns Count of tasks cloned
   */
  static async cloneTemplateToAircraft(
    templateId: string,
    aircraftId: string,
    organizationId: string
  ): Promise<{ tasksCloned: number }> {
    // Get the template with its tasks
    const template = await prisma.maintenanceTemplate.findUnique({
      where: { id: templateId },
      include: { tasks: { where: { isActive: true } } },
    });

    if (!template) {
      throw new Error('Template not found');
    }

    if (template.organizationId !== organizationId) {
      throw new Error('Unauthorized: template does not belong to this organization');
    }

    // Get the aircraft to verify it exists and belongs to the org
    const aircraft = await prisma.aircraft.findUnique({
      where: { id: aircraftId },
    });

    if (!aircraft) {
      throw new Error('Aircraft not found');
    }

    if (aircraft.organizationId !== organizationId) {
      throw new Error('Unauthorized: aircraft does not belong to this organization');
    }

    let tasksCloned = 0;

    // For each task in the template, create a corresponding MaintenanceTask + AircraftTask
    for (const templateTask of template.tasks) {
      try {
        // Create or find the maintenance task
        const maintenanceTask = await prisma.maintenanceTask.upsert({
          where: {
            code_organizationId: {
              code: templateTask.code,
              organizationId,
            },
          },
          update: {
            // If task already exists, ensure it's active
            isActive: true,
          },
          create: {
            organizationId,
            code: templateTask.code,
            title: templateTask.title,
            description: templateTask.description,
            intervalType: templateTask.intervalType,
            intervalHours: templateTask.intervalHours,
            intervalCycles: templateTask.intervalCycles,
            intervalCalendarDays: templateTask.intervalCalendarDays,
            intervalCalendarMonths: templateTask.intervalCalendarMonths,
            referenceNumber: templateTask.referenceNumber,
            referenceType: templateTask.referenceType,
            isMandatory: templateTask.isMandatory,
            estimatedManHours: templateTask.estimatedManHours,
            requiresInspection: templateTask.requiresInspection,
            applicableModel: templateTask.applicableModel,
            applicablePartNumber: templateTask.applicablePartNumber,
          },
        });

        // Link the task to the aircraft
        await prisma.aircraftTask.upsert({
          where: {
            aircraftId_taskId: {
              aircraftId,
              taskId: maintenanceTask.id,
            },
          },
          update: { isActive: true },
          create: {
            aircraftId,
            taskId: maintenanceTask.id,
            isActive: true,
          },
        });

        tasksCloned++;
      } catch (err) {
        console.error(`Failed to clone task ${templateTask.code}:`, err);
        // Continue with next task instead of failing entirely
      }
    }

    return { tasksCloned };
  }

  /**
   * Detect the maintenance type (HORARIO/CALENDARIO/MIXTO) based on interval configuration
   *
   * @param hasHourLimit - True if the task has an hour limit
   * @param hasCalendarLimit - True if the task has a calendar limit (days or months)
   * @returns The detected interval type
   */
  static detectMaintenanceType(
    hasHourLimit: boolean,
    hasCalendarLimit: boolean
  ): TaskIntervalType {
    if (hasHourLimit && hasCalendarLimit) {
      return 'FLIGHT_HOURS_OR_CALENDAR'; // MIXTO
    }
    if (hasHourLimit) {
      return 'FLIGHT_HOURS'; // HORARIO
    }
    if (hasCalendarLimit) {
      return 'CALENDAR_DAYS'; // CALENDARIO
    }
    return 'ON_CONDITION'; // Default
  }

  /**
   * Extract all unique chapters/sections from a template's tasks
   * Used for organizing the library view
   */
  static async getTemplateChapters(templateId: string): Promise<
    Array<{ chapter: string | null; count: number }>
  > {
    const result = await prisma.maintenanceTemplateTask.groupBy({
      by: ['chapter'],
      where: {
        templateId,
        isActive: true,
      },
      _count: true,
    });

    return result
      .map(r => ({ chapter: r.chapter, count: r._count }))
      .sort((a, b) => {
        if (!a.chapter) return 1;
        if (!b.chapter) return -1;
        return a.chapter.localeCompare(b.chapter);
      });
  }
}
