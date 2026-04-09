import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { requestLogger } from './infrastructure/http/middlewares/requestLogger';
import { errorHandler } from './infrastructure/http/middlewares/errorHandler';
import { authRoutes } from './infrastructure/http/routes/auth.routes';
import { aircraftRoutes } from './infrastructure/http/routes/aircraft.routes';
import { complianceRoutes } from './infrastructure/http/routes/compliance.routes';

export function createApp(): Application {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 200, standardHeaders: true, legacyHeaders: false }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(requestLogger);

  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  const API = '/api/v1';
  app.use(`${API}/auth`, authRoutes);
  app.use(`${API}/aircraft`, aircraftRoutes);
  app.use(`${API}/compliances`, complianceRoutes);

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ status: 'error', code: 'NOT_FOUND', message: 'Route not found' });
  });

  app.use(errorHandler);

  return app;
}
