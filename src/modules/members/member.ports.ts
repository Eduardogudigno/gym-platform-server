import type { Transaction } from '../../common/transaction';
import type { ListQuery } from '../../common/pagination/pagination';
import type { MemberStatus } from '../../common/types/domain';

export interface MemberRecord {
  id: string;
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  address: string | null;
  city: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelationship: string | null;
  status: MemberStatus;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MemberListQuery extends ListQuery {
  status?: MemberStatus;
  search?: string;
}

export interface MemberProfile {
  dateOfBirth?: string | null;
  gender?: string | null;
  address?: string | null;
  city?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  emergencyContactRelationship?: string | null;
  notes?: string | null;
  status?: MemberStatus;
}

export interface MemberRepository {
  findById(id: string, tx?: Transaction, lock?: boolean): Promise<MemberRecord | null>;
  findByUserId(userId: string, tx?: Transaction): Promise<MemberRecord | null>;
  list(query: MemberListQuery): Promise<{ rows: MemberRecord[]; total: number }>;
  create(input: { userId: string } & MemberProfile, tx?: Transaction): Promise<MemberRecord>;
  update(id: string, patch: MemberProfile, tx?: Transaction): Promise<MemberRecord>;
  softDelete(id: string, tx?: Transaction): Promise<void>;
}
