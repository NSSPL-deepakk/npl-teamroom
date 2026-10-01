import { createClient } from 'npm:@supabase/supabase-js@2';

const DAYS_BEFORE = 2;
const RECIPIENTS = [
  'anil@northerndesigns.net',
  'hr@northerndesigns.net',
  'karam@northerndesigns.net',
];
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-birthday-reminder-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type RequestBody = {
  dry_run?: boolean;
  test_mode?: boolean;
  reference_date?: string;
};

type EmployeeBirthday = {
  id: string;
  name: string;
  date_of_birth: string;
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function constantTimeEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  if (leftBytes.length !== rightBytes.length || leftBytes.length === 0) return false;
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }
  return difference === 0;
}

function istDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime());
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] ?? character);
}

function formattedBirthday(date: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${date}T00:00:00.000Z`));
}

function missingSmtpSecrets(): string[] {
  return ['SMTP_HOST', 'SMTP_USERNAME', 'SMTP_PASSWORD', 'EMAIL_FROM']
    .filter((name) => !Deno.env.get(name));
}

async function sendThroughExistingSmtp(
  supabaseUrl: string,
  serviceRoleKey: string,
  employeeName: string,
  birthdayDate: string,
  testMode = false,
) {
  const safeName = escapeHtml(employeeName);
  const displayDate = formattedBirthday(birthdayDate);
  const prefix = testMode ? '[TEST] ' : '';
  const response = await fetch(`${supabaseUrl}/functions/v1/send-email-notification`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({
      to: RECIPIENTS.join(', '),
      subject: `${prefix}Birthday reminder: ${employeeName}`,
      html: `<p><strong>${safeName}</strong></p>
        <p>Birthday date: <strong>${displayDate}</strong></p>
        <p><strong>Birthday is in 2 days.</strong></p>
        <p>Please remember to wish ${safeName} a happy birthday.</p>
        ${testMode ? '<p>This is a manual test of the birthday reminder.</p>' : ''}`,
    }),
  });
  const result = await response.json().catch(() => ({})) as { success?: boolean; error?: string };
  if (!response.ok || result.success !== true) {
    throw new Error(result.error ?? `SMTP email function returned status ${response.status}`);
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body: RequestBody;
  try {
    body = await request.json() as RequestBody;
  } catch {
    body = {};
  }

  const dryRun = body.dry_run === true;
  const testMode = body.test_mode === true;
  const referenceDate = body.reference_date ?? istDate();
  if ((dryRun || testMode) && !isIsoDate(referenceDate)) {
    return json({ error: 'reference_date must use YYYY-MM-DD format' }, 400);
  }
  if (!dryRun && !testMode && body.reference_date !== undefined) {
    return json({ error: 'reference_date is only allowed for dry runs or test mode' }, 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'Supabase server configuration is incomplete' }, 500);
  }

  const expectedToken = Deno.env.get('BIRTHDAY_REMINDER_CRON_TOKEN');
  const providedToken = request.headers.get('x-birthday-reminder-token') ?? '';
  const cronAuthorized = Boolean(expectedToken && constantTimeEqual(providedToken, expectedToken));
  if (!cronAuthorized) {
    if (!dryRun && !testMode) return json({ error: 'Unauthorized' }, 401);

    const authorization = request.headers.get('Authorization');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!authorization?.startsWith('Bearer ') || !anonKey) return json({ error: 'Unauthorized' }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const token = authorization.slice('Bearer '.length);
    const { data: authData, error: authError } = await userClient.auth.getUser(token);
    if (authError || !authData.user) return json({ error: 'Unauthorized' }, 401);

    const { data: employeeActive, error: statusError } = await userClient.rpc('is_current_employee_active');
    if (statusError || employeeActive !== true) return json({ error: 'Your account is inactive.' }, 403);

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: caller, error: callerError } = await adminClient
      .from('profiles')
      .select('role, login_enabled')
      .eq('id', authData.user.id)
      .single();
    if (callerError || !caller?.login_enabled || caller.role !== 'SUPER_ADMIN') {
      return json({ error: 'Only an enabled Super Admin can manually test the birthday reminder' }, 403);
    }
  }

  const birthdayDate = addDays(referenceDate, DAYS_BEFORE);

  if (testMode) {
    const missing = missingSmtpSecrets();
    if (missing.length > 0) return json({ error: `Existing SMTP sender is missing: ${missing.join(', ')}` }, 503);
    try {
      await sendThroughExistingSmtp(supabaseUrl, serviceRoleKey, 'Birthday reminder test', birthdayDate, true);
      return json({ test: true, sentTo: RECIPIENTS.length, birthdayDate });
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'SMTP test email failed' }, 502);
    }
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data, error } = await admin
    .from('employees')
    .select('id, name, date_of_birth')
    .eq('employment_status', 'ACTIVE')
    .not('date_of_birth', 'is', null);
  if (error) return json({ error: `Could not load employee birthdays: ${error.message}` }, 500);

  const birthdayKey = birthdayDate.slice(5);
  const matches = ((data ?? []) as EmployeeBirthday[])
    .filter((employee) => employee.date_of_birth.slice(5) === birthdayKey)
    .sort((first, second) => first.name.localeCompare(second.name));

  if (dryRun) {
    return json({
      dryRun: true,
      referenceDate,
      birthdayDate,
      matchCount: matches.length,
      matches: matches.map(({ id, name, date_of_birth }) => ({ id, name, date_of_birth })),
    });
  }

  if (matches.length === 0) return json({ sent: 0, skipped: 0, failed: 0, birthdayDate });

  const missing = missingSmtpSecrets();
  if (missing.length > 0) return json({ error: `Existing SMTP sender is missing: ${missing.join(', ')}` }, 503);

  let sent = 0;
  let skipped = 0;
  const failures: { employee: string; error: string }[] = [];

  for (const employee of matches) {
    const { data: claimed, error: claimError } = await admin.rpc('claim_birthday_reminder', {
      p_employee_id: employee.id,
      p_birthday_date: birthdayDate,
    });
    if (claimError) {
      failures.push({ employee: employee.name, error: claimError.message });
      continue;
    }
    if (claimed !== true) {
      skipped += 1;
      continue;
    }

    try {
      await sendThroughExistingSmtp(supabaseUrl, serviceRoleKey, employee.name, birthdayDate);
      const { error: logError } = await admin
        .from('birthday_reminder_log')
        .update({ status: 'SENT', sent_at: new Date().toISOString(), last_error: null })
        .eq('employee_id', employee.id)
        .eq('birthday_date', birthdayDate);
      if (logError) throw new Error(`Email sent, but reminder log update failed: ${logError.message}`);
      sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Email delivery failed';
      await admin
        .from('birthday_reminder_log')
        .update({ status: 'FAILED', last_error: message.slice(0, 1000) })
        .eq('employee_id', employee.id)
        .eq('birthday_date', birthdayDate);
      failures.push({ employee: employee.name, error: message });
    }
  }

  return json({ sent, skipped, failed: failures.length, failures, birthdayDate }, failures.length > 0 ? 207 : 200);
});