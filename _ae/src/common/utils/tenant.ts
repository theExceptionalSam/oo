import { NotFoundException } from '@nestjs/common';

/**
 * Tenant isolation helpers.
 *
 * Every list/ownership check funnels through here so the rule stays in one
 * place: a non-super-admin may only see and mutate records belonging to their
 * own school. Cross-tenant reads surface as 404 (not 403) so record existence
 * in another tenant is never confirmed.
 */
export interface Caller {
  sub: string;
  role: string;
  school_id: string | null;
}

export const isSuperAdmin = (caller?: Caller | null) =>
  caller?.role === 'SUPER_ADMIN';

/** Merge the caller's school into a TypeORM `where` object. */
export const tenantWhere = (
  caller: Caller | undefined | null,
  where: Record<string, unknown> = {},
): Record<string, unknown> =>
  isSuperAdmin(caller) || !caller?.school_id ? where : { ...where, schoolId: caller.school_id };

/**
 * Throw 404 when a fetched record belongs to another tenant.
 * Records without a schoolId are considered tenant-agnostic (shared).
 */
export const assertSameTenant = (
  caller: Caller | undefined | null,
  recordSchoolId: string | null | undefined,
): void => {
  if (isSuperAdmin(caller) || !caller?.school_id) return;
  if (recordSchoolId && recordSchoolId !== caller.school_id) {
    throw new NotFoundException();
  }
};
