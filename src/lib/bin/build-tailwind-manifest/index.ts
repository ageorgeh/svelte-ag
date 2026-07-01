import process from 'node:process';

import { main } from './cli.js';

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
