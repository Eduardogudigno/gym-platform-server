export type Role = 'admin' | 'staff' | 'member';

export interface AuthContext {
  id: string;
  role: Role;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthContext;
    }
  }
}

export function isStaffRole(role: Role): boolean {
  return role === 'admin' || role === 'staff';
}
