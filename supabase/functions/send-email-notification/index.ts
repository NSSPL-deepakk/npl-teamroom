import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type NotificationKind = 'announcement_created' | 'leave_request_submitted';

type NotificationRequest = {
  kind: NotificationKind;
  record_id: string;
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function validEmail(value: string | null | undefined): value is string {
  return Boolean(value && EMAIL_PATTERN.test(value.trim()));
}

async function sendEmail(apiKey: string, from: string, to: string, subject: string, html: string) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });
  if (!response.ok) {
    throw new Error(`Resend returned ${response.status}: ${await response.text()}`);
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authorization = request.headers.get('Authorization');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const resendFromEmail = Deno.env.get('RESEND_FROM_EMAIL');
  if (!authorization?.startsWith('Bearer ') || !supabaseUrl || !anonKey || !serviceRoleKey || !resendApiKey || !resendFromEmail) {
    console.error('[send-email-notification] Server configuration or authorization is incomplete');
    return json({ error: 'Server configuration is incomplete' }, 500);
  }

  const token = authorization.slice('Bearer '.length);
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: authData, error: authError } = await userClient.auth.getUser(token);
  if (authError || !authData.user) {
    console.error('[send-email-notification] Invalid session', authError?.message);
    return json({ error: 'Invalid session' }, 401);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: caller, error: callerError } = await adminClient
    .from('profiles')
    .select('employee_id, role, login_enabled')
    .eq('id', authData.user.id)
    .single();
  if (callerError || !caller || caller.login_enabled === false) {
    console.error('[send-email-notification] Caller profile lookup failed', callerError?.message);
    return json({ error: 'Caller profile is not active' }, 403);
  }

  let payload: NotificationRequest;
  try {
    payload = await request.json();
  } catch (error) {
    console.error('[send-email-notification] Invalid request body', error);
    return json({ error: 'Invalid request body' }, 400);
  }
  if (!payload.record_id || !['announcement_created', 'leave_request_submitted'].includes(payload.kind)) {
    return json({ error: 'kind and record_id are required' }, 400);
  }

  let recipients: string[] = [];
  let subject = '';
  let html = '';

  if (payload.kind === 'announcement_created') {
    if (!['HR', 'SUPER_ADMIN'].includes(caller.role)) return json({ error: 'Only HR or Admin users can announce' }, 403);

    const { data: announcement, error: announcementError } = await adminClient
      .from('holidays')
      .select('id, date, name, description, category')
      .eq('id', payload.record_id)
      .single();
    if (announcementError || !announcement || announcement.category !== 'Announcement') {
      return json({ error: 'Announcement was not found' }, 404);
    }

    const { data: employees, error: employeesError } = await adminClient
      .from('employees')
      .select('email')
      .eq('employment_status', 'ACTIVE');
    if (employeesError) return json({ error: 'Could not load announcement recipients' }, 500);
    recipients = [...new Set((employees ?? []).map((employee) => employee.email).filter(validEmail))];
    subject = `Announcement: ${announcement.name}`;
    html = `<h2>${escapeHtml(announcement.name)}</h2><p><strong>Date:</strong> ${escapeHtml(announcement.date)}</p><p>${escapeHtml(announcement.description ?? '')}</p>`;
  } else {
    const { data: leaveRequest, error: leaveError } = await adminClient
      .from('leave_requests')
      .select('id, employee_id, type, start_date, end_date, reason')
      .eq('id', payload.record_id)
      .single();
    if (leaveError || !leaveRequest) return json({ error: 'Leave request was not found' }, 404);

    const { data: requestEmployee, error: employeeError } = await adminClient
      .from('employees')
      .select('id, name, manager_id')
      .eq('id', leaveRequest.employee_id)
      .single();
    if (employeeError || !requestEmployee) return json({ error: 'Leave employee was not found' }, 404);
    const isOwner = caller.employee_id === requestEmployee.id;
    const isAdmin = ['HR', 'SUPER_ADMIN'].includes(caller.role);
    const isManager = caller.role === 'MANAGER' && caller.employee_id === requestEmployee.manager_id;
    if (!isOwner && !isAdmin && !isManager) return json({ error: 'Not authorized for this leave request' }, 403);

    const { data: hrProfiles, error: profileError } = await adminClient
      .from('profiles')
      .select('email')
      .in('role', ['HR', 'SUPER_ADMIN'])
      .eq('login_enabled', true);
    if (profileError) return json({ error: 'Could not load leave recipients' }, 500);
    recipients = [...new Set((hrProfiles ?? []).map((profile) => profile.email).filter(validEmail))];
    const days = Math.round((new Date(`${leaveRequest.end_date}T00:00:00`).getTime() - new Date(`${leaveRequest.start_date}T00:00:00`).getTime()) / 86400000) + 1;
    subject = `Leave request: ${requestEmployee.name}`;
    html = `<h2>New leave request</h2><p><strong>Employee:</strong> ${escapeHtml(requestEmployee.name)}</p><p><strong>Leave type:</strong> ${escapeHtml(leaveRequest.type)}</p><p><strong>From:</strong> ${escapeHtml(leaveRequest.start_date)}</p><p><strong>To:</strong> ${escapeHtml(leaveRequest.end_date)}</p><p><strong>Number of days:</strong> ${days}</p><p><strong>Reason:</strong> ${escapeHtml(leaveRequest.reason)}</p>`;
  }

  const failures: string[] = [];
  for (const recipient of recipients) {
    try {
      await sendEmail(resendApiKey, resendFromEmail, recipient, subject, html);
    } catch (error) {
      failures.push(`${recipient}: ${error instanceof Error ? error.message : String(error)}`);
      console.error('[send-email-notification] Email delivery failed', { recipient, error });
    }
  }

  return json({ sent: recipients.length - failures.length, failed: failures.length });
});
