import { Router } from 'express';
import { z } from 'zod';
import { authorize } from '../../common/middleware/authorize';
import { asyncHandler, validate } from '../../common/middleware/validate';
import { listSchema, optionalUuid } from '../../common/pagination/pagination';
import { ok, pageMeta } from '../../common/responses/api-response';
import { authenticate } from '../auth/authenticate';
import type { UserRepository } from '../users/user.ports';
import type { ReminderService } from './reminder.service';
import type { SubscriptionService } from '../subscriptions/subscription.service';

const listRemindersSchema = listSchema(
  {
    subscriptionId: optionalUuid,
    type: z.enum(['expiring_7d', 'expiring_3d', 'expiring_1d', 'expired']).optional(),
    status: z.enum(['pending', 'sent', 'failed']).optional(),
  },
  ['createdAt', 'scheduledFor'],
  'createdAt',
);

export class ReminderController {
  constructor(
    private readonly reminders: ReminderService,
    private readonly subscriptions: SubscriptionService,
  ) {}

  list = asyncHandler(async (req, res) => {
    const query = req.validated?.query as z.infer<typeof listRemindersSchema>;
    const result = await this.reminders.list(query);
    res.json(ok(result.rows, pageMeta(query.page, query.pageSize, result.total)));
  });

  expire = asyncHandler(async (_req, res) => {
    const result = await this.subscriptions.expireDue();
    const reminders = await this.reminders.notifyExpired(result.expired);
    res.json(ok({ ...result, remindersCreated: reminders.created }));
  });

  generate = asyncHandler(async (_req, res) => {
    res.json(ok(await this.reminders.generate()));
  });
}

export function reminderRoutes(controller: ReminderController, users: UserRepository): Router {
  const router = Router();
  router.use(authenticate(users), authorize('admin', 'staff'));
  router.get('/', validate({ query: listRemindersSchema }), controller.list);
  return router;
}

export function jobRoutes(controller: ReminderController, users: UserRepository): Router {
  const router = Router();
  router.use(authenticate(users), authorize('admin'));
  router.post('/subscriptions/expire', controller.expire);
  router.post('/subscriptions/reminders', controller.generate);
  return router;
}
