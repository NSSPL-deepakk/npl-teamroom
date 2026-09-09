import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { notifyLeaveRequestSubmitted } from '../lib/notifications';

export type LeaveType = 'Casual' | 'Sick' | 'Annual' | 'Other';
export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface LeaveRequest {
  id: string;
  employee_id: string;
  type: LeaveType;
  start_date: string;
  end_date: string;
  reason: string;
  status: LeaveStatus;
  requested_at: string;
  decided_by: string | null;
  decided_at: string | null;
}

const SELECT_COLUMNS = 'id, employee_id, type, start_date, end_date, reason, status, requested_at, decided_by, decided_at';

/** Inclusive day count between start and end. */
export function leaveDayCount(r: Pick<LeaveRequest, 'start_date' | 'end_date'>): number {
  const start = new Date(r.start_date + 'T00:00:00');
  const end = new Date(r.end_date + 'T00:00:00');
  return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

export function useLeaveRequests() {
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('leave_requests')
      .select(SELECT_COLUMNS)
      .order('requested_at', { ascending: false });
    if (error) {
      setError(error.message);
      console.error('[Leave] Could not load requests:', error);
      setLoading(false);
      return;
    }
    setError(null);
    setRequests((data ?? []) as LeaveRequest[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const requestLeave = useCallback(
    async (employeeId: string, payload: { type: LeaveType; start_date: string; end_date: string; reason: string }) => {
      const { data, error } = await supabase
        .from('leave_requests')
        .insert({ employee_id: employeeId, ...payload })
        .select(SELECT_COLUMNS)
        .single();
      if (error) {
        console.error('[Leave] Could not submit request:', error);
        return error.message;
      }
      setRequests((prev) => [data as LeaveRequest, ...prev]);
      notifyLeaveRequestSubmitted((data as LeaveRequest).id);
      return null;
    },
    [],
  );

  const decide = useCallback(async (id: string, status: 'APPROVED' | 'REJECTED') => {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      const message = userError?.message ?? 'You must be signed in to decide a leave request.';
      console.error('[Leave] Could not identify decision maker:', userError);
      return message;
    }

    const { data, error } = await supabase
      .from('leave_requests')
      .update({ status, decided_by: userData.user.id, decided_at: new Date().toISOString() })
      .eq('id', id)
      .select(SELECT_COLUMNS)
      .single();
    if (error) {
      console.error('[Leave] Could not decide request:', error);
      return error.message;
    }
    setRequests((prev) => prev.map((request) => (request.id === id ? data as LeaveRequest : request)));
    return null;
  }, []);

  const approve = useCallback((id: string) => decide(id, 'APPROVED'), [decide]);
  const reject = useCallback((id: string) => decide(id, 'REJECTED'), [decide]);

  const updateRequest = useCallback(async (id: string, changes: { employee_id: string; type: LeaveType; start_date: string; end_date: string; reason: string }) => {
    const { data, error: updateError } = await supabase
      .from('leave_requests')
      .update(changes)
      .eq('id', id)
      .select(SELECT_COLUMNS)
      .single();
    if (updateError) {
      console.error('[Leave] Could not update request:', updateError);
      return updateError.message;
    }
    setRequests((prev) => prev.map((request) => (request.id === id ? data as LeaveRequest : request)));
    return null;
  }, []);

  return { requests, requestLeave, updateRequest, approve, reject, loading, error, refresh };
}
