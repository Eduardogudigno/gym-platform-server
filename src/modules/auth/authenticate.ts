import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { AppError } from '../../common/errors/app-error';
import { asyncHandler } from '../../common/middleware/validate';
import type { Role } from '../../common/types/auth';
import type { UserRepository } from '../users/user.ports';

interface AccessPayload {
  sub: string;
  email: string;
  role: Role;
  typ: string;
}

export function authenticate(users: UserRepository) {
  return asyncHandler(async (req, _res, next) => {
    const header = req.header('authorization');
    if (!header?.startsWith('Bearer ')) throw new AppError(401, 'UNAUTHORIZED', 'Missing access token');
    try {
      const payload = jwt.verify(header.slice('Bearer '.length), env.jwtAccessSecret) as AccessPayload;
      if (payload.typ !== 'access' || !payload.sub) throw new AppError(401, 'UNAUTHORIZED', 'Invalid access token');
      const user = await users.findById(payload.sub);
      if (!user || user.status !== 'active') throw new AppError(401, 'UNAUTHORIZED', 'Account is not active');
      req.user = { id: user.id, role: user.role, email: user.email };
      next();
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof jwt.TokenExpiredError) throw new AppError(401, 'TOKEN_EXPIRED', 'Access token expired');
      throw new AppError(401, 'UNAUTHORIZED', 'Invalid access token');
    }
  });
}
