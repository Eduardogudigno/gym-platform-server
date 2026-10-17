import { AppError } from './errors/app-error';

export function toMoney(value: string | number): string {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 9_999_999.99) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid amount');
  }
  return numeric.toFixed(2);
}

export function toCents(value: string): number {
  return Math.round(Number(value) * 100);
}

export function fromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}
