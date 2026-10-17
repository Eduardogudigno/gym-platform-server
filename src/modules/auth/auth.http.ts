import { Router } from 'express';
import { z } from 'zod';
import { authLimiter } from '../../common/middleware/rate-limit';
import { asyncHandler, validate } from '../../common/middleware/validate';
import { ok } from '../../common/responses/api-response';
import { emailSchema, passwordSchema, personNameSchema } from '../../common/validation';
import { profileShape } from '../../common/schemas';
import type { AuthService, ClientMeta } from './auth.service';
import { authenticate } from './authenticate';
import type { UserRepository } from '../users/user.ports';

const optionalPhone = z.string().trim().max(30).nullable().optional();

const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: personNameSchema,
  lastName: personNameSchema,
  phone: optionalPhone,
  ...profileShape,
});

const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(72) });
const refreshSchema = z.object({ refreshToken: z.string().min(1) });
const forgotSchema = z.object({ email: emailSchema });
const resetSchema = z.object({ token: z.string().min(20), newPassword: passwordSchema });

function meta(req: { get(name: string): string | undefined; ip?: string }): ClientMeta {
  return { userAgent: req.get('user-agent') ?? null, ipAddress: req.ip ?? null };
}

export class AuthController {
  constructor(private readonly auth: AuthService) {}

  register = asyncHandler(async (req, res) => {
    res.status(201).json(ok(await this.auth.register(req.validated?.body as z.infer<typeof registerSchema>, meta(req))));
  });

  login = asyncHandler(async (req, res) => {
    const body = req.validated?.body as z.infer<typeof loginSchema>;
    res.json(ok(await this.auth.login(body.email, body.password, meta(req))));
  });

  refresh = asyncHandler(async (req, res) => {
    const body = req.validated?.body as z.infer<typeof refreshSchema>;
    res.json(ok(await this.auth.refresh(body.refreshToken, meta(req))));
  });

  logout = asyncHandler(async (req, res) => {
    const body = req.validated?.body as z.infer<typeof refreshSchema>;
    await this.auth.logout(req.user!.id, body.refreshToken);
    res.json(ok({ revoked: true }));
  });

  forgot = asyncHandler(async (req, res) => {
    const body = req.validated?.body as z.infer<typeof forgotSchema>;
    await this.auth.forgotPassword(body.email);
    res.json(ok({ message: 'If the account exists, password reset instructions were sent.' }));
  });

  reset = asyncHandler(async (req, res) => {
    const body = req.validated?.body as z.infer<typeof resetSchema>;
    await this.auth.resetPassword(body.token, body.newPassword);
    res.json(ok({ reset: true }));
  });

  me = asyncHandler(async (req, res) => {
    res.json(ok(await this.auth.me(req.user!.id)));
  });
}

export function authRoutes(controller: AuthController, users: UserRepository): Router {
  const router = Router();
  const guard = authenticate(users);
  router.post('/register', authLimiter, validate({ body: registerSchema }), controller.register);
  router.post('/login', authLimiter, validate({ body: loginSchema }), controller.login);
  router.post('/refresh', authLimiter, validate({ body: refreshSchema }), controller.refresh);
  router.post('/logout', guard, validate({ body: refreshSchema }), controller.logout);
  router.post('/forgot-password', authLimiter, validate({ body: forgotSchema }), controller.forgot);
  router.post('/reset-password', authLimiter, validate({ body: resetSchema }), controller.reset);
  router.get('/me', guard, controller.me);
  return router;
}
