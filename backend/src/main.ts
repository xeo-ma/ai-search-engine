import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';

import { createApp } from './app.js';

const currentFilePath = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFilePath);
const projectRootEnvPath = path.resolve(currentDir, '../../.env');

dotenv.config();
dotenv.config({ path: projectRootEnvPath });

const host = process.env.HOST ?? '0.0.0.0';
const port = Number(process.env.PORT ?? 3001);

const app = createApp();

async function start(): Promise<void> {
  try {
    await app.listen({ host, port });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

void start();
