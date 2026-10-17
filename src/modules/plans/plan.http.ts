import { Router } from 'express';
import { z } from 'zod';
import { authorize } from '../../common/middleware/authorize';
import { asyncHandler, validate } from '../../common/middleware/validate';
import { listSchema } from '../../common/pagination/pagination';
import { ok, pageMeta } from '../../common/responses/api-response';
import { moneySchema, optionalBoolean, profileShape } from '../../common/schemas';
import { emailSchema, passwordSchema, personNameSchema, uuidParam } from '../../common/validation';
import { authenticate } from '../auth/authenticate';
import type { EnrollmentService, EnrollOnPlanInput } from '../enrollments/enrollment.service';
import { paymentSchema } from '../subscriptions/subscription.http';
import type { UserRepository } from '../users/user.ports';
import type { PlanInput, PlanService } from './plan.service';

const duration = z.enum(['monthly', 'quarterly', 'yearly']);

const listPlansSchema = listSchema({ isActive: optionalBoolean }, ['name', 'price', 'createdAt'], 'name', 'asc');

const writeSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).nullable().optional(),
  price: moneySchema,
  currency: z.string().trim().length(3).optional(),
  duration,
  benefits: z.array(z.string().trim().min(1).max(200)).max(30).optional(),
  isActive: z.boolean().optional(),
});

const enrollSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: personNameSchema,
  lastName: personNameSchema,
  phone: z.string().trim().max(30).nullable().optional(),
  ...profileShape,
  startDate: z.coerce.date().optional(),
  autoRenew: z.boolean().optional(),
  payment: paymentSchema.optional(),
});

export class PlanController {
  constructor(
    private readonly plans: PlanService,
    private readonly enrollments: EnrollmentService,
  ) {}

  list = asyncHandler(async (req, res) => {
    const query = req.validated?.query as z.infer<typeof listPlansSchema>;
    const result = await this.plans.list(query, req.user!);
    res.json(ok(result.rows, pageMeta(query.page, query.pageSize, result.total)));
  });

  get = asyncHandler(async (req, res) => {
    const { id } = req.validated?.params as z.infer<typeof uuidParam>;
    res.json(ok(await this.plans.get(id, req.user!)));
  });

  create = asyncHandler(async (req, res) => {
    res.status(201).json(ok(await this.plans.create(req.validated?.body as PlanInput)));
  });

  enroll = asyncHandler(async (req, res) => {
    const { id } = req.validated?.params as z.infer<typeof uuidParam>;
    const body = req.validated?.body as EnrollOnPlanInput;
    res.status(201).json(ok(await this.enrollments.enroll(id, body, req.user!.id)));
  });

  update = asyncHandler(async (req, res) => {
    const { id } = req.validated?.params as z.infer<typeof uuidParam>;
    res.json(ok(await this.plans.update(id, req.validated?.body as Partial<PlanInput>)));
  });

  setStatus = asyncHandler(async (req, res) => {
    const { id } = req.validated?.params as z.infer<typeof uuidParam>;
    const body = req.validated?.body as { isActive: boolean };
    res.json(ok(await this.plans.setStatus(id, body.isActive)));
  });

  remove = asyncHandler(async (req, res) => {
    const { id } = req.validated?.params as z.infer<typeof uuidParam>;
    await this.plans.remove(id);
    res.json(ok({ id, deleted: true }));
  });
}

export function planRoutes(controller: PlanController, users: UserRepository): Router {
  const router = Router();
  router.use(authenticate(users));
  router.get('/', validate({ query: listPlansSchema }), controller.list);
  router.post('/', authorize('admin'), validate({ body: writeSchema }), controller.create);
  router.post(
    '/:id/members',
    authorize('admin', 'staff'),
    validate({ params: uuidParam, body: enrollSchema }),
    controller.enroll,
  );
  router.get('/:id', validate({ params: uuidParam }), controller.get);
  router.patch('/:id', authorize('admin'), validate({ params: uuidParam, body: writeSchema.partial() }), controller.update);
  router.patch(
    '/:id/status',
    authorize('admin'),
    validate({ params: uuidParam, body: z.object({ isActive: z.boolean() }) }),
    controller.setStatus,
  );
  router.delete('/:id', authorize('admin'), validate({ params: uuidParam }), controller.remove);
  return router;
}
