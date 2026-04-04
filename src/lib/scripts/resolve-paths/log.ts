import { styleText } from 'util';

const LABEL = '[resolve-paths]';

export function time() {
  const now = new Date();

  let hours = now.getHours();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();

  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;

  const pad = (n: number) => n.toString().padStart(2, '0');

  return styleText('grey', `[${pad(hours)}:${pad(minutes)}:${pad(seconds)} ${ampm}]`);
}

export function logInfo(message: string): void {
  console.log(`${LABEL} ${time()} ${message}`);
}

export function logError(message: string): void {
  console.error(`${LABEL} ${time()} ${message}`);
}
