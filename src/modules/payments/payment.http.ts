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
import type { CreateIntentInput, CreatePaymentInput, PaymentService } from './payment.service';

const listPaymentsSchema = listSchema(
  {
    memberId: optionalUuid,
    subscriptionId: optionalUuid,
    status: z.enum(['pending', 'completed', 'failed', 'refunded']).optional(),
    from: optionalDate,
    to: optionalDate,
  },
  ['createdAt', 'paidAt', 'amount'],
  'createdAt',
);

const createSchema = z.object({
  subscriptionId: z.string().uuid(),
  amount: moneySchema,
  currency: z.string().trim().length(3).optional(),
  method: z.enum(['cash', 'card', 'transfer', 'gateway']),
  status: z.enum(['pending', 'completed', 'failed']).optional(),
  reference: z.string().trim().max(191).optional(),
  idempotencyKey: z.string().trim().min(1).max(191).optional(),
  notes: z.string().trim().max(500).optional(),
});

const intentSchema = z.object({
  subscriptionId: z.string().uuid(),
  amount: moneySchema,
  currency: z.string().trim().length(3).optional(),
});

export class PaymentController {
  constructor(private readonly payments: PaymentService) {}

  list = asyncHandler(async (req, res) => {
    const query = req.validated?.query as z.infer<typeof listPaymentsSchema>;
    const result = await this.payments.list(query);
    res.json(ok(result.rows, pageMeta(query.page, query.pageSize, result.total)));
  });

  create = asyncHandler(async (req, res) => {
    const payment = await this.payments.create(req.validated?.body as CreatePaymentInput, req.user!.id);
    res.status(201).json(ok(payment));
  });

  get = asyncHandler(async (req, res) => {
    const { id } = req.validated?.params as z.infer<typeof uuidParam>;
    res.json(ok(await this.payments.get(id, req.user!)));
  });

  refund = asyncHandler(async (req, res) => {
    const { id } = req.validated?.params as z.infer<typeof uuidParam>;
    res.json(ok(await this.payments.refund(id)));
  });

  createIntent = asyncHandler(async (req, res) => {
    res.status(201).json(ok(await this.payments.createIntent(req.validated?.body as CreateIntentInput, req.user!.id)));
  });

  webhook = asyncHandler(async (req, res) => {
    const provider = String(req.params.provider ?? '');
    const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
    const payment = await this.payments.handleWebhook(provider, req.headers, rawBody);
    res.json(ok(payment));
  });
}

export function paymentRoutes(controller: PaymentController, users: UserRepository): Router {
  const router = Router();
  const staff = authorize('admin', 'staff');
  router.use(authenticate(users));
  router.get('/', staff, validate({ query: listPaymentsSchema }), controller.list);
  router.post('/', staff, validate({ body: createSchema }), controller.create);
  router.post('/intents', staff, validate({ body: intentSchema }), controller.createIntent);
  router.get('/:id', validate({ params: uuidParam }), controller.get);
  router.post('/:id/refund', authorize('admin'), validate({ params: uuidParam }), controller.refund);
  return router;
}

export function webhookRoutes(controller: PaymentController): Router {
  const router = Router();
  router.post('/payments/:provider', controller.webhook);
  return router;
}
