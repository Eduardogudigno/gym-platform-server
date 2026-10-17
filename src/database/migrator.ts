import fs from 'fs';
import path from 'path';
import { SequelizeStorage, Umzug } from 'umzug';
import { sequelize } from '../config/database';

const extension = path.extname(__filename);

function migrationsRoot(): string {
  const besideRunner = path.join(__dirname, 'migrations');
  const hasJavaScript = (dir: string): boolean =>
    fs.existsSync(dir) && fs.readdirSync(dir).some((file) => file.endsWith('.js'));
  if (hasJavaScript(besideRunner)) return __dirname;
  const sourceRoot = path.resolve(process.cwd(), 'src/database');
  if (hasJavaScript(path.join(sourceRoot, 'migrations'))) return sourceRoot;
  return __dirname;
}

export const migrator = new Umzug({
  migrations: {
    glob: ['migrations/*.js', { cwd: migrationsRoot() }],
  },
  context: sequelize.getQueryInterface(),
  storage: new SequelizeStorage({ sequelize }),
  logger: console,
});

export const seeder = new Umzug({
  migrations: {
    glob: [`seeders/*${extension}`, { cwd: __dirname }],
  },
  context: sequelize,
  storage: new SequelizeStorage({ sequelize, modelName: 'SequelizeSeedMeta' }),
  logger: console,
});
