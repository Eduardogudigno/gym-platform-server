import type { Transaction } from 'sequelize';

export interface TransactionRunner {
  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
}

export type { Transaction };
