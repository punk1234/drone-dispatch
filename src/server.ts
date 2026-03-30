import 'dotenv/config';
import express from 'express';
import App from './app/app';
import { logger } from './utils/logger';

const PORT = parseInt(process.env.PORT || '3000', 10);

/********************************************************
 * APPLICATION MAIN
 ********************************************************/

const main = async () => {
  const app = new App(express(), PORT);

  await app.initialize();
  app.checkDependencies();
  app.run();

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received — shutting down gracefully`);
    await app.close();
    logger.info('Goodbye.');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
};

/********************************************************
 * RUN APPLICATION
 ********************************************************/

main().catch((err) => {
  logger.error('Failed to start server:', err);
  process.exit(1);
});
