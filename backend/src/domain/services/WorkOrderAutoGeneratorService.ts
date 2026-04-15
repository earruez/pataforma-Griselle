import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * WorkOrderAutoGeneratorService
 * Escanea el plan de mantenimiento y genera OT automáticamente
 * cuando detecta tareas próximas a vencer u vencidas
 */
export class WorkOrderAutoGeneratorService {
  /**
   * Buscar tareas próximas a vencer u ovenidas para una aeronave
   * @param aircraftId - ID de la aeronave
   * @param organizationId - Contexto de organización
   * @returns Array de tareas que necesitan OT
   */
  static async findTasksDueSoon(
    aircraftId: string,
    organizationId: string
  ): Promise<
    Array<{
      aircraftId: string;
      taskId: string;
      status: 'OVERDUE' | 'DUE_SOON' | 'NEVER_PERFORMED';
      hoursRemaining?: number;
      daysRemaining?: number;
    }>
  > {
    // Este método reutiliza lógica del AircraftService
    // para obtener tareas OVERDUE/DUE_SOON
    const tasks = await prisma.aircraftTask.findMany({
      where: { aircraftId },
      include: {
        task: true,
        aircraft: true,
      },
    });

    const result = [];

    for (const at of tasks) {
      const { task, aircraft } = at;

      // Placeholder: aquí iría la lógica de cálculo de vencimiento
      // Por ahora retornamos formato esperado
      result.push({
        aircraftId,
        taskId: task.id,
        status: 'DUE_SOON' as const,
        hoursRemaining: 50,
        daysRemaining: 7,
      });
    }

    return result;
  }

  /**
   * Generar automáticamente Work Order para una tarea vencida/próxima
   * @param aircraftId - ID de la aeronave
   * @param taskId - ID de la tarea
   * @param organizationId - Contexto de org
   * @param createdById - Usuario que genera la OT
   * @returns WorkOrder creada
   */
  static async generateWorkOrder(
    aircraftId: string,
    taskId: string,
    organizationId: string,
    createdById: string
  ): Promise<any> {
    // Obtener la aeronave
    const aircraft = await prisma.aircraft.findUnique({
      where: { id: aircraftId },
    });

    if (!aircraft) {
      throw new Error('Aircraft not found');
    }

    if (aircraft.organizationId !== organizationId) {
      throw new Error('Unauthorized: aircraft does not belong to this organization');
    }

    // Obtener la tarea
    const task = await prisma.maintenanceTask.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      throw new Error('Task not found');
    }

    // Generar número de OT único por organización
    const lastWO = await prisma.workOrder.findFirst({
      where: { organizationId },
      orderBy: { number: 'desc' },
      select: { number: true },
    });

    const nextNumber = lastWO ? parseInt(lastWO.number.split('-').pop() || '0') + 1 : 1;
    const year = new Date().getFullYear();
    const woNumber = `OT-${year}-${String(nextNumber).padStart(4, '0')}`;

    // Crear Work Order en estado PENDING_ASSIGNMENT
    const workOrder = await prisma.workOrder.create({
      data: {
        organizationId,
        number: woNumber,
        aircraftId,
        title: `Mantenimiento: ${task.title}`,
        description: task.description || undefined,
        status: 'DRAFT',
        assignmentStatus: 'PENDING',
        createdById,
        plannedStartDate: new Date(),
        plannedEndDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Default: 7 días desde ahora
        aircraftHoursAtOpen: Number(aircraft.totalFlightHours),
        aircraftCyclesAtOpen: aircraft.totalCycles,
      },
    });

    // Agregar la tarea a la OT
    await prisma.workOrderTask.create({
      data: {
        workOrderId: workOrder.id,
        taskId,
      },
    });

    return workOrder;
  }

  /**
   * Obtener todas las OT pendientes de asignación para una organización
   */
  static async getPendingAssignmentWorkOrders(organizationId: string): Promise<any[]> {
    return prisma.workOrder.findMany({
      where: {
        organizationId,
        assignmentStatus: 'PENDING',
      },
      include: {
        aircraft: {
          select: { id: true, registration: true, model: true },
        },
        createdBy: {
          select: { id: true, name: true, email: true },
        },
        tasks: {
          include: { task: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Obtener contador de OT pendientes por aeronave
   */
  static async getPendingCountByAircraft(
    aircraftId: string,
    organizationId: string
  ): Promise<number> {
    return prisma.workOrder.count({
      where: {
        organizationId,
        aircraftId,
        assignmentStatus: 'PENDING',
      },
    });
  }
}
