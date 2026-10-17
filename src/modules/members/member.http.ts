import { Router } from 'express';
import { z } from 'zod';
import { authorize } from '../../common/middleware/authorize';
import { asyncHandler, validate } from '../../common/middleware/validate';
import { listSchema } from '../../common/pagination/pagination';
import { ok, pageMeta } from '../../common/responses/api-response';
import { profileShape } from '../../common/schemas';
import { emailSchema, passwordSchema, personNameSchema, uuidParam } from '../../common/validation';
import { authenticate } from '../auth/authenticate';
import type { UserRepository } from '../users/user.ports';
import type { CreateMemberInput, MemberService, UpdateMemberInput } from './member.service';

const optionalPhone = z.string().trim().max(30).nullable().optional();
const memberStatus = z.enum(['active', 'inactive', 'suspended']);

const listSchemaMembers = listSchema(
  {
    status: memberStatus.optional(),
    search: z.string().trim().max(100).optional(),
  },
  ['createdAt', 'status'],
  'createdAt',
);

const createSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: personNameSchema,
  lastName: personNameSchema,
  phone: optionalPhone,
  status: memberStatus.optional(),
  ...profileShape,
});

const updateSchema = z.object({
  firstName: personNameSchema.optional(),
  lastName: personNameSchema.optional(),
  phone: optionalPhone,
  status: memberStatus.optional(),
  ...profileShape,
});

export class MemberController {
  constructor(private readonly members: MemberService) {}

  list = asyncHandler(async (req, res) => {
    const query = req.validated?.query as z.infer<typeof listSchemaMembers>;
    const result = await this.members.list(query);
    res.json(ok(result.rows, pageMeta(query.page, query.pageSize, result.total)));
  });

  create = asyncHandler(async (req, res) => {
    res.status(201).json(ok(await this.members.create(req.validated?.body as CreateMemberInput)));
  });

  get = asyncHandler(async (req, res) => {
    const { id } = req.validated?.params as z.infer<typeof uuidParam>;
    res.json(ok(await this.members.get(id, req.user!)));
  });

  update = asyncHandler(async (req, res) => {
    const { id } = req.validated?.params as z.infer<typeof uuidParam>;
    res.json(ok(await this.members.update(id, req.validated?.body as UpdateMemberInput, req.user!)));
  });

  changeStatus = asyncHandler(async (req, res) => {
    const { id } = req.validated?.params as z.infer<typeof uuidParam>;
    const body = req.validated?.body as { status: 'active' | 'inactive' | 'suspended' };
    res.json(ok(await this.members.changeStatus(id, body.status)));
  });

  history = asyncHandler(async (req, res) => {
    const { id } = req.validated?.params as z.infer<typeof uuidParam>;
    res.json(ok(await this.members.history(id, req.user!)));
  });

  remove = asyncHandler(async (req, res) => {
    const { id } = req.validated?.params as z.infer<typeof uuidParam>;
    await this.members.remove(id);
    res.json(ok({ id, deleted: true }));
  });
}

export function memberRoutes(controller: MemberController, users: UserRepository): Router {
  const router = Router();
  router.use(authenticate(users));
  router.get('/', authorize('admin', 'staff'), validate({ query: listSchemaMembers }), controller.list);
  router.post('/', authorize('admin', 'staff'), validate({ body: createSchema }), controller.create);
  router.get('/:id/history', validate({ params: uuidParam }), controller.history);
  router.get('/:id', validate({ params: uuidParam }), controller.get);
  router.patch('/:id', validate({ params: uuidParam, body: updateSchema }), controller.update);
  router.patch(
    '/:id/status',
    authorize('admin', 'staff'),
    validate({ params: uuidParam, body: z.object({ status: memberStatus }) }),
    controller.changeStatus,
  );
  router.delete('/:id', authorize('admin'), validate({ params: uuidParam }), controller.remove);
  return router;
}
