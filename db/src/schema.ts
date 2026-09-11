import { sql } from 'drizzle-orm';
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  date,
  time,
  timestamp,
  pgPolicy,
  index,
} from 'drizzle-orm/pg-core';
import { authUsers, authenticatedRole } from 'drizzle-orm/supabase';

// ─────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────
export const appRoleEnum = pgEnum('app_role', ['SUPER_ADMIN', 'HR', 'MANAGER', 'EMPLOYEE']);
export const employmentStatusEnum = pgEnum('employment_status', ['ACTIVE', 'INACTIVE']);
export const workModeEnum = pgEnum('work_mode', ['OFFICE', 'WFH', 'HYBRID']);
export const genderEnum = pgEnum('gender_type', ['Male', 'Female', 'Other', 'Prefer not to say']);
export const holidayCategoryEnum = pgEnum('holiday_category', [
  'National Holiday',
  'Optional Holiday',
  'Company Holiday',
  'Announcement',
]);
export const leaveTypeEnum = pgEnum('leave_type', ['Casual', 'Sick', 'Annual', 'Other']);
export const leaveStatusEnum = pgEnum('leave_status', ['PENDING', 'APPROVED', 'REJECTED']);

// A single reusable "is this user SUPER_ADMIN or HR" check, inlined into
// policies below. Kept as a template string (not a DB function) so every
// policy is self-contained and there's no function-creation ordering to
// worry about during migration.
const isAdminOrHr = sql`exists (
  select 1 from public.profiles p
  where p.id = auth.uid() and p.role in ('SUPER_ADMIN', 'HR')
)`;

const isManagerOf = (employeeId: unknown) => sql`public.is_manager_of(${employeeId})`;

// ─────────────────────────────────────────────────────────────
// departments
// ─────────────────────────────────────────────────────────────
export const departments = pgTable(
  'departments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  () => [
    pgPolicy('departments_select_authenticated', {
      for: 'select',
      to: authenticatedRole,
      using: sql`true`,
    }),
    pgPolicy('departments_write_admin_hr', {
      for: 'all',
      to: authenticatedRole,
      using: isAdminOrHr,
      withCheck: isAdminOrHr,
    }),
  ],
).enableRLS();

// ─────────────────────────────────────────────────────────────
// designations
// ─────────────────────────────────────────────────────────────
export const designations = pgTable(
  'designations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    departmentId: uuid('department_id').notNull().references(() => departments.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  () => [
    pgPolicy('designations_select_authenticated', {
      for: 'select',
      to: authenticatedRole,
      using: sql`true`,
    }),
    pgPolicy('designations_write_admin_hr', {
      for: 'all',
      to: authenticatedRole,
      using: isAdminOrHr,
      withCheck: isAdminOrHr,
    }),
  ],
).enableRLS();

// ─────────────────────────────────────────────────────────────
// holidays
// ─────────────────────────────────────────────────────────────
export const holidays = pgTable(
  'holidays',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    date: date('date').notNull(),
    eventTime: time('event_time'),
    name: text('name').notNull(),
    category: holidayCategoryEnum('category').notNull(),
    description: text('description'),
    image: text('image'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  () => [
    pgPolicy('holidays_select_authenticated', {
      for: 'select',
      to: authenticatedRole,
      using: sql`true`,
    }),
    pgPolicy('holidays_write_admin_hr', {
      for: 'all',
      to: authenticatedRole,
      using: isAdminOrHr,
      withCheck: isAdminOrHr,
    }),
  ],
).enableRLS();

// ─────────────────────────────────────────────────────────────
// employees
// ─────────────────────────────────────────────────────────────
export const employees = pgTable(
  'employees',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    employeeCode: text('employee_code').notNull().unique(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    phone: text('phone'),
    departmentId: uuid('department_id').references((): any => departments.id, { onDelete: 'set null' }),
    designationId: uuid('designation_id').references((): any => designations.id, { onDelete: 'set null' }),
    managerId: uuid('manager_id').references((): any => employees.id, { onDelete: 'set null' }),
    joiningDate: date('joining_date').notNull(),
    dateOfBirth: date('date_of_birth'),
    birthdayMessage: text('birthday_message'),
    anniversaryMessage: text('anniversary_message'),
    gender: genderEnum('gender'),
    employmentStatus: employmentStatusEnum('employment_status').notNull().default('ACTIVE'),
    workMode: workModeEnum('work_mode').notNull().default('OFFICE'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('employees_department_id_idx').on(table.departmentId),
    index('employees_designation_id_idx').on(table.designationId),
    index('employees_manager_id_idx').on(table.managerId),

    pgPolicy('employees_all_admin_hr', {
      for: 'all',
      to: authenticatedRole,
      using: isAdminOrHr,
      withCheck: isAdminOrHr,
    }),
    pgPolicy('employees_select_manager_team', {
      for: 'select',
      to: authenticatedRole,
      using: sql`exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role = 'MANAGER'
          and (${table.managerId} = p.employee_id or ${table.id} = p.employee_id)
      )`,
    }),
    pgPolicy('employees_select_self', {
      for: 'select',
      to: authenticatedRole,
      using: sql`exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role = 'EMPLOYEE'
          and ${table.id} = p.employee_id
      )`,
    }),
    pgPolicy('employees_update_self', {
      for: 'update',
      to: authenticatedRole,
      using: sql`exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.employee_id = ${table.id}
      )`,
      withCheck: sql`exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.employee_id = ${table.id}
      )`,
    }),
  ],
).enableRLS();

// ─────────────────────────────────────────────────────────────
// profiles
// One row per Supabase auth user. id == auth.users.id (1:1).
// ─────────────────────────────────────────────────────────────
export const profiles = pgTable(
  'profiles',
  {
    id: uuid('id').primaryKey().references(() => authUsers.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    email: text('email').notNull(),
    role: appRoleEnum('role').notNull().default('EMPLOYEE'),
    employeeId: uuid('employee_id').references(() => employees.id, { onDelete: 'set null' }),
    loginEnabled: boolean('login_enabled').notNull().default(true),
    lastActiveAt: timestamp('last_active_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('profiles_employee_id_idx').on(table.employeeId),

    pgPolicy('profiles_all_admin_hr', {
      for: 'all',
      to: authenticatedRole,
      using: isAdminOrHr,
      withCheck: isAdminOrHr,
    }),
    pgPolicy('profiles_select_self', {
      for: 'select',
      to: authenticatedRole,
      using: sql`${table.id} = auth.uid()`,
    }),
    pgPolicy('profiles_update_self', {
      for: 'update',
      to: authenticatedRole,
      using: sql`${table.id} = auth.uid()`,
      withCheck: sql`${table.id} = auth.uid()`,
    }),
  ],
).enableRLS();

// ─────────────────────────────────────────────────────────────
// notifications
// ─────────────────────────────────────────────────────────────
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    recipientUserId: uuid('recipient_user_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    message: text('message').notNull(),
    referenceId: uuid('reference_id'),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('notifications_recipient_created_idx').on(table.recipientUserId, table.createdAt),
    pgPolicy('notifications_select_own', {
      for: 'select',
      to: authenticatedRole,
      using: sql`${table.recipientUserId} = auth.uid()`,
    }),
    pgPolicy('notifications_update_own', {
      for: 'update',
      to: authenticatedRole,
      using: sql`${table.recipientUserId} = auth.uid()`,
      withCheck: sql`${table.recipientUserId} = auth.uid()`,
    }),
  ],
).enableRLS();

// ─────────────────────────────────────────────────────────────
// leave_requests
// ─────────────────────────────────────────────────────────────
export const leaveRequests = pgTable(
  'leave_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    employeeId: uuid('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    type: leaveTypeEnum('type').notNull(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    reason: text('reason').notNull(),
    status: leaveStatusEnum('status').notNull().default('PENDING'),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
    decidedBy: uuid('decided_by').references(() => profiles.id, { onDelete: 'set null' }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
  },
  (table) => [
    index('leave_requests_employee_id_idx').on(table.employeeId),
    pgPolicy('leave_select_own_or_manager_or_admin', {
      for: 'select',
      to: authenticatedRole,
      using: sql`(
        exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and p.employee_id = ${table.employeeId}
        )
        or ${isManagerOf(table.employeeId)}
        or ${isAdminOrHr}
      )`,
    }),
    pgPolicy('leave_insert_self_manager_or_admin', {
      for: 'insert',
      to: authenticatedRole,
      withCheck: sql`(
        exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and p.employee_id = ${table.employeeId}
        )
        or ${isManagerOf(table.employeeId)}
        or ${isAdminOrHr}
      )`,
    }),
    pgPolicy('leave_update_manager_or_admin_only', {
      for: 'update',
      to: authenticatedRole,
      using: sql`${isManagerOf(table.employeeId)} or ${isAdminOrHr}`,
      withCheck: sql`${isManagerOf(table.employeeId)} or ${isAdminOrHr}`,
    }),
  ],
).enableRLS();
