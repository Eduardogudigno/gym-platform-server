import { AppError } from './errors/app-error';
import { isStaffRole, type AuthContext } from './types/auth';

export function assertSelfOrStaff(actor: AuthContext, ownerUserId: string): void {
  if (isStaffRole(actor.role)) return;
  if (actor.id !== ownerUserId) throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
}
