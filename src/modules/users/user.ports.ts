import type { Transaction } from '../../common/transaction';
import type { ListQuery } from '../../common/pagination/pagination';
import type { Role } from '../../common/types/auth';
import type { UserStatus } from '../../common/types/domain';

export interface UserRecord {
  id: string;
  email: string;
  role: Role;
  status: UserStatus;
  firstName: string;
  lastName: string;
  phone: string | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthUserRecord extends UserRecord {
  passwordHash: string;
}

export interface UserListQuery extends ListQuery {
  role?: Role;
  status?: UserStatus;
  search?: string;
}

export interface UserWrite {
  email: string;
  passwordHash: string;
  role: Role;
  status?: UserStatus;
  firstName: string;
  lastName: string;
  phone?: string | null;
}

export interface UserPatch {
  email?: string;
  passwordHash?: string;
  role?: Role;
  status?: UserStatus;
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  lastLoginAt?: Date | null;
}

export interface UserRepository {
  findById(id: string, tx?: Transaction): Promise<UserRecord | null>;
  findByEmail(email: string, tx?: Transaction): Promise<UserRecord | null>;
  findAuthByEmail(email: string): Promise<AuthUserRecord | null>;
  list(query: UserListQuery): Promise<{ rows: UserRecord[]; total: number }>;
  create(input: UserWrite, tx?: Transaction): Promise<UserRecord>;
  update(id: string, patch: UserPatch, tx?: Transaction): Promise<UserRecord>;
  countActiveAdmins(tx?: Transaction): Promise<number>;
  anonymizeAndDelete(id: string, tx?: Transaction): Promise<void>;
}
