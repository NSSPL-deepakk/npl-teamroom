import { useCallback, useEffect, useState } from 'react';
import type { WorkMode } from './employees';
import { supabase } from '../lib/supabase';
import { classifyDay, type Holiday } from './holidays';

export const STANDARD_HOURS_PER_DAY = 9;
export const STANDARD_SHIFT_END = '18:00';
export const EARLY_CHECKOUT_THRESHOLD_MINUTES = 510;
export const OVERTIME_THRESHOLD_MINUTES = 545;

export type OvertimeApprovalStatus = 'approved' | 'pending' | 'rejected';

export interface AttendanceRecord {
  id: string;
  employee_id: string;
  date: string; // YYYY-MM-DD
  check_in: string | null; // HH:MM
  check_out: string | null; // HH:MM
  check_in_at: string | null;
  check_out_at: string | null;
  original_check_in: string | null;
  original_check_out: string | null;
  latitude: number | null;
  longitude: number | null;
  work_mode: WorkMode;
  status: 'PRESENT' | 'ABSENT';
  is_manual_entry: boolean;
  manual_entry_reason: string | null;
  is_early_checkout: boolean;
  early_checkout_reason: string | null;
  overtime_minutes: number;
  overtime_reason: string | null;
  overtime_approval_status: OvertimeApprovalStatus | null;
  overtime_approved_by: string | null;
  manual_approval_status: 'approved' | 'pending' | 'rejected';
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  work_summary: string | null;
  work_done_today: string | null;
  is_overtime: boolean;
  updated_at: string | null;
  created_at: string | null;
  mats: string | null;
}

export interface AttendanceAuditEntry {
  id: string;
  record_id: string;
  changed_by: string;
  changed_on: string;
  previous_check_in: string | null;
  previous_check_out: string | null;
  updated_check_in: string | null;
  updated_check_out: string | null;
  reason: string;
}

function minutesFromTime(time: string | null): number | null {
  if (!time) return null;
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function normalizeRecord(record: Partial<AttendanceRecord>): AttendanceRecord {
  const workedMinutes = record.check_in && record.check_out
    ? Math.max(0, (minutesFromTime(record.check_out) ?? 0) - (minutesFromTime(record.check_in) ?? 0))
    : 0;
  const early = workedMinutes < EARLY_CHECKOUT_THRESHOLD_MINUTES;
  const overtime = record.overtime_minutes ?? Math.max(0, workedMinutes - OVERTIME_THRESHOLD_MINUTES);
  return {
    id: record.id ?? crypto.randomUUID(),
    employee_id: record.employee_id ?? '',
    date: record.date ?? today(),
    check_in: record.check_in ?? null,
    check_out: record.check_out ?? null,
    check_in_at: record.check_in_at ?? null,
    check_out_at: record.check_out_at ?? null,
    original_check_in: record.original_check_in ?? record.check_in ?? null,
    original_check_out: record.original_check_out ?? record.check_out ?? null,
    latitude: record.latitude ?? null,
    longitude: record.longitude ?? null,
    work_mode: record.work_mode ?? 'OFFICE',
    status: record.status ?? 'PRESENT',
    is_manual_entry: record.is_manual_entry ?? false,
    manual_entry_reason: record.manual_entry_reason ?? null,
    is_early_checkout: record.is_early_checkout ?? early,
    early_checkout_reason: record.early_checkout_reason ?? null,
    overtime_minutes: overtime,
    overtime_reason: record.overtime_reason ?? null,
    overtime_approval_status: record.overtime_approval_status ?? (overtime > 0 ? 'pending' : null),
    overtime_approved_by: record.overtime_approved_by ?? null,
    manual_approval_status: record.manual_approval_status ?? (record.is_manual_entry ? 'pending' : 'approved'),
    approved_by: record.approved_by ?? null,
    approved_at: record.approved_at ?? null,
    rejected_by: record.rejected_by ?? null,
    rejected_at: record.rejected_at ?? null,
    work_summary: record.work_summary ?? null,
    work_done_today: record.work_done_today ?? null,
    is_overtime: record.is_overtime ?? overtime > 0,
    updated_at: record.updated_at ?? null,
    created_at: record.created_at ?? null,
    mats: record.mats ?? null,
  };
}

function validateRecord(record: Pick<AttendanceRecord, 'is_manual_entry' | 'manual_entry_reason' | 'is_early_checkout' | 'early_checkout_reason' | 'overtime_minutes' | 'overtime_reason' | 'work_summary'>): boolean {
  return (!record.is_manual_entry || Boolean(record.manual_entry_reason?.trim()))
    && (!record.is_manual_entry || Boolean(record.work_summary?.trim()))
    && (!record.is_early_checkout || Boolean(record.early_checkout_reason?.trim()))
    && (record.overtime_minutes <= 0 || Boolean(record.overtime_reason?.trim()));
}

function deriveMetadata(checkIn: string | null, checkOut: string | null, overrides: Partial<AttendanceRecord> = {}): Pick<AttendanceRecord, 'is_early_checkout' | 'overtime_minutes' | 'overtime_approval_status'> {
  const inMinutes = minutesFromTime(checkIn);
  const outMinutes = minutesFromTime(checkOut);
  const workedMinutes = inMinutes !== null && outMinutes !== null ? Math.max(0, outMinutes - inMinutes) : 0;
  const overtimeMinutes = Math.max(0, workedMinutes - OVERTIME_THRESHOLD_MINUTES);
  return {
    is_early_checkout: workedMinutes < EARLY_CHECKOUT_THRESHOLD_MINUTES,
    overtime_minutes: overrides.overtime_minutes ?? overtimeMinutes,
    overtime_approval_status: (overrides.overtime_minutes ?? overtimeMinutes) > 0 ? (overrides.overtime_approval_status ?? 'pending') : null,
  };
}

function nowHM(): string {
  return new Date().toTimeString().slice(0, 5);
}

function today(): string {
  return localDate(new Date());
}

function localDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function hoursBetween(checkIn: string | null, checkOut: string | null): number | null {
  if (!checkIn || !checkOut) return null;
  const [inH, inM] = checkIn.split(':').map(Number);
  const [outH, outM] = checkOut.split(':').map(Number);
  const minutes = outH * 60 + outM - (inH * 60 + inM);
  if (minutes <= 0) return null;
  return Math.round((minutes / 60) * 10) / 10;
}

export function recordsForMonth(records: AttendanceRecord[], employeeId: string, year: number, month: number): AttendanceRecord[] {
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  return records
    .filter((r) => r.employee_id === employeeId && r.date.startsWith(prefix))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.check_in ?? '').localeCompare(b.check_in ?? ''));
}

export function totalHoursForMonth(records: AttendanceRecord[], employeeId: string, year: number, month: number): number {
  return Math.round(
    recordsForMonth(records, employeeId, year, month).reduce((sum, r) => sum + (hoursBetween(r.check_in, r.check_out) ?? 0), 0) * 10,
  ) / 10;
}

export function daySessionsForMonth(
  records: AttendanceRecord[],
  employeeId: string,
  year: number,
  month: number,
): Array<{ date: string; sessions: AttendanceRecord[]; total: number }> {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  const result: Array<{ date: string; sessions: AttendanceRecord[]; total: number }> = [];

  for (let day = 1; day <= end.getDate(); day++) {
    const date = new Date(year, month - 1, day).toISOString().slice(0, 10);
    const sessions = records
      .filter((r) => r.employee_id === employeeId && r.date === date)
      .sort((a, b) => (a.check_in ?? '').localeCompare(b.check_in ?? ''));

    const total = sessions.reduce((sum, r) => sum + (hoursBetween(r.check_in, r.check_out) ?? 0), 0);
    result.push({ date, sessions, total: Math.round(total * 10) / 10 });
  }

  return result.filter((entry) => entry.date >= start.toISOString().slice(0, 10) && entry.date <= end.toISOString().slice(0, 10));
}

export function requiredHoursForMonth(year: number, month: number, holidays: Pick<Holiday, 'date' | 'category'>[] = [], hoursPerDay = STANDARD_HOURS_PER_DAY): number {
  const now = new Date();
  const isCurrentMonth = now.getFullYear() === year && now.getMonth() + 1 === month;
  const lastDay = isCurrentMonth ? now.getDate() : new Date(year, month, 0).getDate();

  let weekdays = 0;
  for (let day = 1; day <= lastDay; day++) {
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (classifyDay(date, holidays) === 'WORKING_DAY') weekdays++;
  }
  return weekdays * hoursPerDay;
}

export function requiredHoursForEmployeeMonth(
  records: AttendanceRecord[],
  employeeId: string,
  year: number,
  month: number,
  holidays: Pick<Holiday, 'date' | 'category'>[] = [],
  hoursPerDay = STANDARD_HOURS_PER_DAY,
): number {
  const baseline = requiredHoursForMonth(year, month, holidays, hoursPerDay);
  const workedOffDays = new Set(
    recordsForMonth(records, employeeId, year, month)
      .filter((record) => classifyDay(record.date, holidays) !== 'WORKING_DAY' && Boolean(record.check_in))
      .map((record) => record.date),
  );
  return baseline + workedOffDays.size * hoursPerDay;
}

export function hasOpenSession(records: AttendanceRecord[], employeeId: string, date = today()): AttendanceRecord | null {
  return (
    records.find(
      (r) => r.employee_id === employeeId && r.date === date && r.check_in && !r.check_out,
    ) ?? null
  );
}

export function useAttendance() {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [audit, setAudit] = useState<AttendanceAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [attendanceResult, auditResult] = await Promise.all([
      supabase.from('attendance').select('*').order('date', { ascending: false }).order('check_in', { ascending: false }),
      supabase.from('attendance_audit').select('*').order('created_at', { ascending: false }),
    ]);
    const fetchError = attendanceResult.error ?? auditResult.error;
    if (fetchError) {
      setError(fetchError.message);
    } else {
      setError(null);
      setRecords((attendanceResult.data ?? []).map((row) => normalizeRecord(row as Partial<AttendanceRecord>)));
      setAudit((auditResult.data ?? []) as AttendanceAuditEntry[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const checkIn = useCallback(
    (employeeId: string, workMode: WorkMode, coords: { latitude: number; longitude: number } | null, isOvertime = false) => {
      const date = today();
      if (hasOpenSession(records, employeeId, date)) return false;
      void (async () => {
        const { data, error: insertError } = await supabase.from('attendance').insert({
          employee_id: employeeId, date, check_in: nowHM(), check_out: null,
          check_in_at: new Date().toISOString(),
          latitude: coords?.latitude ?? null, longitude: coords?.longitude ?? null,
          work_mode: workMode, status: 'PRESENT', is_overtime: isOvertime, overtime_approval_status: isOvertime ? 'pending' : null, mats: new Date().toISOString(),
        }).select('*').single();
        if (insertError) { setError(insertError.message); return; }
        setError(null);
        setRecords((prev) => [normalizeRecord(data as Partial<AttendanceRecord>), ...prev]);
      })();
      return true;
    },
    [records],
  );

  const checkOut = useCallback((employeeId: string, workDoneToday = '') => {
    const open = [...records]
      .filter((r) => r.employee_id === employeeId && r.date === today() && r.check_in && !r.check_out)
      .sort((a, b) => (a.check_in ?? '').localeCompare(b.check_in ?? ''))
      .at(-1);
    if (!open) return false;
    void (async () => {
      const { data, error: updateError } = await supabase.from('attendance').update({
        check_out: nowHM(), check_out_at: new Date().toISOString(), status: 'PRESENT',
        work_done_today: workDoneToday.trim() || null, mats: new Date().toISOString(),
      }).eq('id', open.id).select('*').single();
      if (updateError) { setError(updateError.message); return; }
      setError(null);
      setRecords((prev) => prev.map((record) => record.id === open.id ? normalizeRecord(data as Partial<AttendanceRecord>) : record));
    })();
    return true;
  }, [records]);

  const addManualEntry = useCallback(
    (employeeId: string, draft: { date: string; check_in: string; check_out: string; work_mode: WorkMode; manual_entry_reason: string; work_summary: string; early_checkout_reason?: string; overtime_reason?: string; is_overtime?: boolean; work_done_today?: string }) => {
      if (draft.date > today()) return false;
      const metadata = deriveMetadata(draft.check_in, draft.check_out);
      const record = normalizeRecord({
        employee_id: employeeId, date: draft.date, check_in: draft.check_in, check_out: draft.check_out,
        latitude: null, longitude: null, work_mode: draft.work_mode, status: 'PRESENT', is_manual_entry: true,
        manual_entry_reason: draft.manual_entry_reason, work_summary: draft.work_summary, early_checkout_reason: draft.early_checkout_reason ?? null,
        overtime_reason: draft.overtime_reason ?? null, ...metadata,
      });
      if (draft.is_overtime && record.check_in && record.check_out) {
        record.is_overtime = true;
        record.overtime_approval_status = 'pending';
      }
      if (!validateRecord(record)) return false;
      void (async () => {
        const { data, error: insertError } = await supabase.from('attendance').insert({
          employee_id: record.employee_id, date: record.date, check_in: record.check_in, check_out: record.check_out,
          check_in_at: new Date(`${record.date}T${record.check_in}:00`).toISOString(),
          check_out_at: new Date(`${record.date}T${record.check_out}:00`).toISOString(),
          original_check_in: record.check_in, original_check_out: record.check_out,
          latitude: record.latitude, longitude: record.longitude, work_mode: record.work_mode, status: record.status,
          is_manual_entry: record.is_manual_entry, manual_entry_reason: record.manual_entry_reason,
          work_summary: record.work_summary,
          is_early_checkout: record.is_early_checkout, early_checkout_reason: record.early_checkout_reason,
          overtime_minutes: record.overtime_minutes, overtime_reason: record.overtime_reason,
          overtime_approval_status: record.overtime_approval_status, overtime_approved_by: record.overtime_approved_by,
          manual_approval_status: 'pending', is_overtime: draft.is_overtime ?? record.overtime_minutes > 0,
          work_done_today: draft.work_done_today ?? null,
          mats: new Date().toISOString(),
        }).select('*').single();
        if (insertError) { setError(insertError.message); return; }
        setError(null);
        setRecords((prev) => [normalizeRecord(data as Partial<AttendanceRecord>), ...prev]);
      })();
      return true;
    },
    [],
  );

  const updateAttendanceRecord = useCallback(
    (recordId: string, changes: Pick<AttendanceRecord, 'check_in' | 'check_out' | 'work_mode'> & Partial<Pick<AttendanceRecord, 'early_checkout_reason' | 'overtime_reason' | 'overtime_approval_status'>>, reason: string) => {
      if (!reason.trim()) return false;
      const previous = records.find((record) => record.id === recordId) ?? null;
      if (!previous) return false;
      const next = normalizeRecord({ ...previous, ...changes, ...deriveMetadata(changes.check_in, changes.check_out, changes), is_manual_entry: true, manual_entry_reason: reason.trim() });
      if (!validateRecord(next)) return false;
      void (async () => {
        const { data, error: updateError } = await supabase.from('attendance').update({
          check_in: next.check_in, check_out: next.check_out, work_mode: next.work_mode,
          check_in_at: next.check_in ? new Date(`${next.date}T${next.check_in}:00`).toISOString() : null,
          check_out_at: next.check_out ? new Date(`${next.date}T${next.check_out}:00`).toISOString() : null,
          original_check_in: previous.original_check_in ?? previous.check_in,
          original_check_out: previous.original_check_out ?? previous.check_out,
          is_manual_entry: true, manual_entry_reason: next.manual_entry_reason,
          is_early_checkout: next.is_early_checkout, early_checkout_reason: next.early_checkout_reason,
          overtime_minutes: next.overtime_minutes, overtime_reason: next.overtime_reason,
          overtime_approval_status: next.overtime_approval_status, is_overtime: next.overtime_minutes > 0,
          manual_approval_status: 'pending', mats: new Date().toISOString(),
        }).eq('id', recordId).select('*').single();
        if (updateError) { setError(updateError.message); return; }
        const { data: auditData, error: auditError } = await supabase.from('attendance_audit').insert({
          record_id: recordId, changed_by: 'Authenticated user',
          previous_check_in: previous.check_in, previous_check_out: previous.check_out,
          updated_check_in: next.check_in, updated_check_out: next.check_out, reason: reason.trim(),
        }).select('*').single();
        if (auditError) { setError(auditError.message); return; }
        setError(null);
        setRecords((prev) => prev.map((record) => record.id === recordId ? normalizeRecord(data as Partial<AttendanceRecord>) : record));
        setAudit((prev) => [auditData as AttendanceAuditEntry, ...prev]);
      })();
      return true;
    },
    [records],
  );

  const updateApproval = useCallback((recordId: string, status: 'approved' | 'rejected') => {
    void (async () => {
      const { data: approverId, error: approverError } = await supabase.rpc('current_employee_id');
      if (approverError) { setError(approverError.message); return; }
      const { data, error: updateError } = await supabase.from('attendance').update({
        overtime_approval_status: status,
        overtime_approved_by: status === 'approved' ? approverId : null,
        manual_approval_status: status,
        approved_by: status === 'approved' ? approverId : null,
        approved_at: status === 'approved' ? new Date().toISOString() : null,
        rejected_by: status === 'rejected' ? approverId : null,
        rejected_at: status === 'rejected' ? new Date().toISOString() : null,
        mats: new Date().toISOString(),
      }).eq('id', recordId).select('*').single();
      if (updateError) { setError(updateError.message); return; }
      setError(null);
      setRecords((prev) => prev.map((record) => record.id === recordId ? normalizeRecord(data as Partial<AttendanceRecord>) : record));
    })();
    return true;
  }, []);

  const approveRecord = useCallback((recordId: string) => updateApproval(recordId, 'approved'), [updateApproval]);
  const rejectRecord = useCallback((recordId: string) => updateApproval(recordId, 'rejected'), [updateApproval]);

  return { records, checkIn, checkOut, addManualEntry, updateAttendanceRecord, approveRecord, rejectRecord, audit, today: today(), loading, error };
}
