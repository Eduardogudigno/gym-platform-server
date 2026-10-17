import { readFileSync } from 'fs';
import path from 'path';
import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import { parse } from 'yaml';

export function docsRouter(): Router {
  const specPath = path.resolve(__dirname, '../../openapi/openapi.yaml');
  const raw = readFileSync(specPath, 'utf8');
  const spec = parse(raw) as object;
  const router = Router();
  router.use(swaggerUi.serve);
  router.get('/', swaggerUi.setup(spec));
  router.get('/openapi.yaml', (_req, res) => {
    res.type('yaml').send(raw);
  });
  router.get('/openapi.json', (_req, res) => {
    res.json(spec);
  });
  return router;
}
