import { sequelize } from '../config/database';
import { ensureDatabase } from './ensure-database';
import { migrator } from './migrator';

async function main(): Promise<void> {
  await ensureDatabase();
  if (process.argv[2] === 'down') {
    await migrator.down();
  } else {
    await migrator.up();
  }
  await sequelize.close();
}

main().catch(async (error: unknown) => {
  console.error(error);
  await sequelize.close();
  process.exit(1);
});
