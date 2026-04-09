import { Compliance, CreateComplianceInput } from '../../domain/entities/Compliance';
import { IComplianceRepository, ComplianceFilters } from '../../domain/repositories/IComplianceRepository';
import { IAircraftRepository } from '../../domain/repositories/IAircraftRepository';
import { IComponentRepository } from '../../domain/repositories/IComponentRepository';
import { MaintenanceTask } from '../../domain/entities/MaintenanceTask';
import { ComplianceDueDateService } from '../../domain/services/ComplianceDueDateService';
import { NotFoundError, ValidationError } from '../../shared/errors/AppError';
import { PaginatedResult, PaginationOptions } from '../../domain/repositories/shared';

export interface RecordComplianceInput {
  organizationId: string;
  aircraftId: string;
  taskId: string;
  componentId?: string | null;
  performedById: string;
  inspectedById?: string | null;
  performedAt: Date;
  workOrderNumber?: string | null;
  notes?: string | null;
  deferralReference?: string | null;
  deferralExpiresAt?: Date | null;
}

export class RecordComplianceUseCase {
  private readonly dueDateService = new ComplianceDueDateService();

  constructor(
    private readonly complianceRepo: IComplianceRepository,
    private readonly aircraftRepo: IAircraftRepository,
    private readonly componentRepo: IComponentRepository,
    /** Map of taskId → MaintenanceTask, injected to avoid circular deps */
    private readonly getTask: (taskId: string, orgId: string) => Promise<MaintenanceTask | null>,
  ) {}

  async execute(input: RecordComplianceInput): Promise<Compliance> {
    // 1. Validate aircraft exists in tenant
    const aircraft = await this.aircraftRepo.findById(input.aircraftId, input.organizationId);
    if (!aircraft) throw new NotFoundError('Aircraft', input.aircraftId);

    // 2. Validate component (if applicable) belongs to the same aircraft
    if (input.componentId) {
      const component = await this.componentRepo.findById(
        input.componentId,
        input.organizationId,
      );
      if (!component) throw new NotFoundError('Component', input.componentId);
      if (component.aircraftId !== input.aircraftId) {
        throw new ValidationError(
          `Component '${input.componentId}' is not installed on aircraft '${input.aircraftId}'`,
        );
      }
    }

    // 3. Load task definition to calculate next-due values
    const task = await this.getTask(input.taskId, input.organizationId);
    if (!task) throw new NotFoundError('MaintenanceTask', input.taskId);

    // 4. Calculate next-due — this is the integrity-critical calculation
    const { nextDueHours, nextDueCycles, nextDueDate } = this.dueDateService.calculate(
      task,
      aircraft.totalFlightHours,
      aircraft.totalCycles,
      input.performedAt,
    );

    const complianceInput: CreateComplianceInput = {
      ...input,
      aircraftHoursAtCompliance: aircraft.totalFlightHours,
      aircraftCyclesAtCompliance: aircraft.totalCycles,
      nextDueHours,
      nextDueCycles,
      nextDueDate,
    };

    return this.complianceRepo.create(complianceInput);
  }
}

export class GetComplianceUseCase {
  constructor(private readonly complianceRepo: IComplianceRepository) {}

  async findAllForAircraft(
    aircraftId: string,
    organizationId: string,
    filters?: ComplianceFilters,
    options?: PaginationOptions,
  ): Promise<PaginatedResult<Compliance>> {
    return this.complianceRepo.findAll(
      organizationId,
      { ...filters },
      options,
    );
  }

  async getLatestPerTask(
    aircraftId: string,
    organizationId: string,
  ): Promise<Compliance[]> {
    return this.complianceRepo.findLatestPerTask(aircraftId, organizationId);
  }
}
