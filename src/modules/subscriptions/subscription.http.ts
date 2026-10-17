import { Router } from 'express';
import { z } from 'zod';
import { authorize } from '../../common/middleware/authorize';
import { asyncHandler, validate } from '../../common/middleware/validate';
import { listSchema, optionalDate, optionalUuid } from '../../common/pagination/pagination';
import { ok, pageMeta } from '../../common/responses/api-response';
import { moneySchema } from '../../common/schemas';
import { uuidParam } from '../../common/validation';
import { authenticate } from '../auth/authenticate';
import type { UserRepository } from '../users/user.ports';
import type { ChangePlanInput, CreateSubscriptionInput, RenewSubscriptionInput, SubscriptionService } from './subscription.service';

export const paymentSchema = z.object({
  method: z.enum(['cash', 'card', 'transfer', 'gateway']),
  amount: moneySchema.optional(),
  reference: z.string().trim().max(191).optional(),
  status: z.enum(['pending', 'completed', 'failed']).optional(),
  idempotencyKey: z.string().trim().min(1).max(191).optional(),
  notes: z.string().trim().max(500).optional(),
});

const listSubscriptionsSchema = listSchema(
  {
    status: z.enum(['pending', 'active', 'paused', 'expired', 'cancelled']).optional(),
    memberId: optionalUuid,
    planId: optionalUuid,
    expiringBefore: optionalDate,
  },
  ['createdAt', 'endDate', 'status'],
  'createdAt',
);

const createSchema = z.object({
  memberId: z.string().uuid(),
  planId: z.string().uuid(),
  startDate: z.coerce.date().optional(),
  autoRenew: z.boolean().optional(),
  renewedFromId: z.string().uuid().optional(),
  payment: paymentSchema.optional(),
});

export class SubscriptionController {
  constructor(private readonly subscriptions: SubscriptionService) {}

  list = asyncHandler(async (req, res) => {
    const query = req.validated?.query as z.infer<typeof listSubscriptionsSchema>;
    const result = await this.subscriptions.list(query);
    res.json(ok(result.rows, pageMeta(query.page, query.pageSize, result.total)));
  });

  create = asyncHandler(async (req, res) => {
    const body = req.validated?.body as CreateSubscriptionInput;
    res.status(201).json(ok(await this.subscriptions.create(body, req.user!.id)));
  });

  get = asyncHandler(async (req, res) => {
    const { id } = req.validated?.params as z.infer<typeof uuidParam>;
    res.json(ok(await this.subscriptions.getForActor(id, req.user!)));
  });

  activate = asyncHandler(async (req, res) => {
    const { id } = req.validated?.params as z.infer<typeof uuidParam>;
    res.json(ok(await this.subscriptions.activate(id, req.user!.id)));
  });

  renew = asyncHandler(async (req, res) => {
    const { id } = req.validated?.params as z.infer<typeof uuidParam>;
    const body = req.validated?.body as RenewSubscriptionInput;
    res.json(ok(await this.subscriptions.renew(id, body, req.user!.id)));
  });

  pause = asyncHandler(async (req, res) => {
    const { id } = req.validated?.params as z.infer<typeof uuidParam>;
    res.json(ok(await this.subscriptions.pause(id, req.user!.id)));
  });

  resume = asyncHandler(async (req, res) => {
    const { id } = req.validated?.params as z.infer<typeof uuidParam>;
    res.json(ok(await this.subscriptions.resume(id, req.user!.id)));
  });

  cancel = asyncHandler(async (req, res) => {
    const { id } = req.validated?.params as z.infer<typeof uuidParam>;
    await this.subscriptions.getForActor(id, req.user!);
    const body = (req.validated?.body ?? {}) as { reason?: string };
    res.json(ok(await this.subscriptions.cancel(id, req.user!.id, body.reason)));
  });

  changePlan = asyncHandler(async (req, res) => {
    const { id } = req.validated?.params as z.infer<typeof uuidParam>;
    const body = req.validated?.body as ChangePlanInput;
    res.json(ok(await this.subscriptions.changePlan(id, body, req.user!.id)));
  });

  events = asyncHandler(async (req, res) => {
    const { id } = req.validated?.params as z.infer<typeof uuidParam>;
    res.json(ok(await this.subscriptions.eventsForActor(id, req.user!)));
  });
}

export function subscriptionRoutes(controller: SubscriptionController, users: UserRepository): Router {
  const router = Router();
  const staff = authorize('admin', 'staff');
  router.use(authenticate(users));
  router.get('/', staff, validate({ query: listSubscriptionsSchema }), controller.list);
  router.post('/', staff, validate({ body: createSchema }), controller.create);
  router.get('/:id', validate({ params: uuidParam }), controller.get);
  router.post('/:id/activate', staff, validate({ params: uuidParam }), controller.activate);
  router.post(
    '/:id/renew',
    staff,
    validate({
      params: uuidParam,
      body: z.object({ autoRenew: z.boolean().optional(), payment: paymentSchema.optional() }),
    }),
    controller.renew,
  );
  router.post('/:id/pause', staff, validate({ params: uuidParam }), controller.pause);
  router.post('/:id/resume', staff, validate({ params: uuidParam }), controller.resume);
  router.post(
    '/:id/cancel',
    validate({ params: uuidParam, body: z.object({ reason: z.string().trim().max(255).optional() }).optional() }),
    controller.cancel,
  );
  router.post(
    '/:id/change-plan',
    staff,
    validate({
      params: uuidParam,
      body: z.object({ planId: z.string().uuid(), mode: z.enum(['immediate', 'next_cycle']) }),
    }),
    controller.changePlan,
  );
  router.get('/:id/events', validate({ params: uuidParam }), controller.events);
  return router;
}
