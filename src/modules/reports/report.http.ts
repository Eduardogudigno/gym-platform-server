import { Router } from 'express';
import { z } from 'zod';
import { authorize } from '../../common/middleware/authorize';
import { asyncHandler, validate } from '../../common/middleware/validate';
import { listSchema } from '../../common/pagination/pagination';
import { ok, pageMeta } from '../../common/responses/api-response';
import { authenticate } from '../auth/authenticate';
import type { UserRepository } from '../users/user.ports';
import type { ReportService } from './report.service';

const page = listSchema({}, ['createdAt'], 'createdAt');
const range = z.object({ from: z.coerce.date(), to: z.coerce.date() });

export class ReportController {
  constructor(
    private readonly reports: ReportService,
    private readonly clock: () => Date,
  ) {}

  activeMembers = asyncHandler(async (req, res) => {
    const query = req.validated?.query as z.infer<typeof page>;
    const result = await this.reports.activeMembers(query, this.clock());
    res.json(ok(result.rows, pageMeta(query.page, query.pageSize, result.total)));
  });

  expiring = asyncHandler(async (req, res) => {
    const query = req.validated?.query as z.infer<typeof page> & { withinDays: number };
    const result = await this.reports.expiring(query.withinDays, query, this.clock());
    res.json(ok(result.rows, pageMeta(query.page, query.pageSize, result.total)));
  });

  revenue = asyncHandler(async (req, res) => {
    const query = req.validated?.query as z.infer<typeof range>;
    res.json(ok(await this.reports.revenue(query.from, query.to)));
  });

  renewalRate = asyncHandler(async (req, res) => {
    const query = req.validated?.query as z.infer<typeof range>;
    res.json(ok(await this.reports.renewalRate(query.from, query.to)));
  });
}

export function reportRoutes(controller: ReportController, users: UserRepository): Router {
  const router = Router();
  router.use(authenticate(users), authorize('admin', 'staff'));
  router.get('/members/active', validate({ query: page }), controller.activeMembers);
  router.get(
    '/subscriptions/expiring',
    validate({
      query: listSchema({ withinDays: z.coerce.number().int().min(1).max(90).default(7) }, ['createdAt'], 'createdAt'),
    }),
    controller.expiring,
  );
  router.get('/revenue', validate({ query: range }), controller.revenue);
  router.get('/renewal-rate', validate({ query: range }), controller.renewalRate);
  return router;
}
