import { Router } from 'express';
import { z } from 'zod';
import { authorize } from '../../common/middleware/authorize';
import { asyncHandler, validate } from '../../common/middleware/validate';
import { listSchema } from '../../common/pagination/pagination';
import { ok, pageMeta } from '../../common/responses/api-response';
import { profileShape } from '../../common/schemas';
import { emailSchema, passwordSchema, personNameSchema, uuidParam } from '../../common/validation';
import { authenticate } from '../auth/authenticate';
import type { UserRepository } from './user.ports';
import type { CreateUserInput, UpdateUserInput, UserService } from './user.service';

const optionalPhone = z.string().trim().max(30).nullable().optional();

const listUsersSchema = listSchema(
  {
    role: z.enum(['admin', 'staff', 'member']).optional(),
    status: z.enum(['active', 'inactive']).optional(),
    search: z.string().trim().max(100).optional(),
  },
  ['createdAt', 'email', 'lastName'],
  'createdAt',
);

const createUserSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  role: z.enum(['admin', 'staff', 'member']),
  firstName: personNameSchema,
  lastName: personNameSchema,
  phone: optionalPhone,
  ...profileShape,
});

const updateUserSchema = z.object({
  email: emailSchema.optional(),
  firstName: personNameSchema.optional(),
  lastName: personNameSchema.optional(),
  phone: optionalPhone,
  password: passwordSchema.optional(),
  currentPassword: z.string().min(1).max(72).optional(),
});

export class UserController {
  constructor(private readonly users: UserService) {}

  list = asyncHandler(async (req, res) => {
    const query = req.validated?.query as z.infer<typeof listUsersSchema>;
    const result = await this.users.list(query);
    res.json(ok(result.rows, pageMeta(query.page, query.pageSize, result.total)));
  });

  get = asyncHandler(async (req, res) => {
    const { id } = req.validated?.params as z.infer<typeof uuidParam>;
    res.json(ok(await this.users.get(id, req.user!)));
  });

  create = asyncHandler(async (req, res) => {
    const body = req.validated?.body as CreateUserInput;
    res.status(201).json(ok(await this.users.create(body)));
  });

  update = asyncHandler(async (req, res) => {
    const { id } = req.validated?.params as z.infer<typeof uuidParam>;
    const body = req.validated?.body as UpdateUserInput;
    res.json(ok(await this.users.update(id, body, req.user!)));
  });

  changeRole = asyncHandler(async (req, res) => {
    const { id } = req.validated?.params as z.infer<typeof uuidParam>;
    const body = req.validated?.body as { role: 'admin' | 'staff' | 'member' };
    res.json(ok(await this.users.changeRole(id, body.role)));
  });

  changeStatus = asyncHandler(async (req, res) => {
    const { id } = req.validated?.params as z.infer<typeof uuidParam>;
    const body = req.validated?.body as { status: 'active' | 'inactive' };
    res.json(ok(await this.users.changeStatus(id, body.status)));
  });

  remove = asyncHandler(async (req, res) => {
    const { id } = req.validated?.params as z.infer<typeof uuidParam>;
    await this.users.remove(id, req.user!);
    res.json(ok({ id, deleted: true }));
  });
}

export function userRoutes(controller: UserController, users: UserRepository): Router {
  const router = Router();
  router.use(authenticate(users));
  router.get('/', authorize('admin'), validate({ query: listUsersSchema }), controller.list);
  router.post('/', authorize('admin'), validate({ body: createUserSchema }), controller.create);
  router.get('/:id', validate({ params: uuidParam }), controller.get);
  router.patch('/:id', validate({ params: uuidParam, body: updateUserSchema }), controller.update);
  router.patch(
    '/:id/role',
    authorize('admin'),
    validate({ params: uuidParam, body: z.object({ role: z.enum(['admin', 'staff', 'member']) }) }),
    controller.changeRole,
  );
  router.patch(
    '/:id/status',
    authorize('admin'),
    validate({ params: uuidParam, body: z.object({ status: z.enum(['active', 'inactive']) }) }),
    controller.changeStatus,
  );
  router.delete('/:id', authorize('admin'), validate({ params: uuidParam }), controller.remove);
  return router;
}
