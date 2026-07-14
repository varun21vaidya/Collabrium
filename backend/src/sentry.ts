import * as Sentry from '@sentry/node';
import { logger } from './logger.js';

export function initSentry(app: Parameters<typeof Sentry.setupExpressErrorHandler>[0]): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    logger.warn('SENTRY_DSN not set, skipping Sentry initialization');
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),
  });

  Sentry.setupExpressErrorHandler(app);
  logger.info('Sentry initialized');
}

export { Sentry };
