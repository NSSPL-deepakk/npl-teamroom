import { createClient } from 'npm:@supabase/supabase-js@2';

const DAYS_BEFORE = 1;                                // remind 1 day before
const NOTIFY_TO = ['hr@northerndesigns.net'];         // the person who gets the reminder

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data, error } = await supabase.rpc('upcoming_birthdays', { days_before: DAYS_BEFORE });
  if (error) return new Response(error.message, { status: 500 });
  if (!data?.length) return new Response('No birthdays');

  for (const p of data) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Roster HR <no-reply@northerndesigns.net>',
        to: NOTIFY_TO,
        subject: `Birthday reminder: ${p.name}`,
        html: `<p>${p.name}'s birthday is tomorrow (${p.date_of_birth}).</p>`,
      }),
    });
    if (!res.ok) console.error('Email failed for', p.name, await res.text());
  }

  return new Response(`Sent ${data.length} reminder(s)`);
});