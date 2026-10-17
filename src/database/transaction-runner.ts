import { sequelize } from '../config/database';
import type { TransactionRunner } from '../common/transaction';

export class SequelizeTransactionRunner implements TransactionRunner {
  run<T>(work: (tx: import('sequelize').Transaction) => Promise<T>): Promise<T> {
    return sequelize.transaction((tx) => work(tx));
  }
}
