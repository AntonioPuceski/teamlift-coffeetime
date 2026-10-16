import 'reflect-metadata';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import express from 'express';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app';

config({ path: resolve(__dirname, '../../../.env') });

export async function createApp() {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.enableShutdownHooks();
  const web = resolve(__dirname, '../../web/dist');
  if (existsSync(web)) app.use(express.static(web));
  return app;
}

if (require.main === module) {
  createApp()
    .then((app) => app.listen(Number(process.env.PORT || 3001), process.env.HOST || '127.0.0.1'))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
