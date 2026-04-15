import { logger } from '../../config/logger';
import { WorkRequestService } from '../../domain/services/WorkRequestService';

const DAILY_MS = 24 * 60 * 60 * 1000;
let timer: ReturnType<typeof setInterval> | null = null;

export function startWorkRequestAutoJob(): void {
  if (timer) return;

  // Kick a first run shortly after startup.
  setTimeout(async () => {
    try {
      const result = await WorkRequestService.runDailyAutoGenerationForAllOrganizations();
      logger.info({ result }, 'WorkRequest auto generation first run completed');
    } catch (err) {
      logger.error({ err }, 'WorkRequest auto generation first run failed');
    }
  }, 5_000);

  timer = setInterval(async () => {
    try {
      const result = await WorkRequestService.runDailyAutoGenerationForAllOrganizations();
      logger.info({ result }, 'WorkRequest daily auto generation completed');
    } catch (err) {
      logger.error({ err }, 'WorkRequest daily auto generation failed');
    }
  }, DAILY_MS);
}

export function stopWorkRequestAutoJob(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}
