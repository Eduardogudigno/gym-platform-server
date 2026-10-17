import { Router } from 'express';
import { z } from 'zod';
import { authorize } from '../../common/middleware/authorize';
import { asyncHandler, validate } from '../../common/middleware/validate';
import { listSchema, optionalDate, optionalUuid } from '../../common/pagination/pagination';
import { ok, pageMeta } from '../../common/responses/api-response';
import { uuidParam } from '../../common/validation';
import { authenticate } from '../auth/authenticate';
import type { UserRepository } from '../users/user.ports';
import type { AttendanceService } from './attendance.service';

const listAttendanceSchema = listSchema(
  { memberId: optionalUuid, from: optionalDate, to: optionalDate },
  ['checkedInAt'],
  'checkedInAt',
);

export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  checkIn = asyncHandler(async (req, res) => {
    const body = (req.validated?.body ?? {}) as { memberId?: string; notes?: string };
    res.status(201).json(ok(await this.attendance.checkIn(body, req.user!)));
  });

  list = asyncHandler(async (req, res) => {
    const query = req.validated?.query as z.infer<typeof listAttendanceSchema>;
    const result = await this.attendance.list(query);
    res.json(ok(result.rows, pageMeta(query.page, query.pageSize, result.total)));
  });

  get = asyncHandler(async (req, res) => {
    const { id } = req.validated?.params as z.infer<typeof uuidParam>;
    res.json(ok(await this.attendance.get(id, req.user!)));
  });
}

export function attendanceRoutes(controller: AttendanceController, users: UserRepository): Router {
  const router = Router();
  router.use(authenticate(users));
  router.post(
    '/check-in',
    validate({
      body: z.object({ memberId: z.string().uuid().optional(), notes: z.string().trim().max(255).optional() }),
    }),
    controller.checkIn,
  );
  router.get('/', authorize('admin', 'staff'), validate({ query: listAttendanceSchema }), controller.list);
  router.get('/:id', validate({ params: uuidParam }), controller.get);
  return router;
}
