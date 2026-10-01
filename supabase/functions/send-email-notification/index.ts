import { SMTPClient } from "npm:emailjs@4.0.3";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Method not allowed",
      }),
      {
        status: 405,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }

  try {
    const authorization = req.headers.get('Authorization');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!authorization?.startsWith('Bearer ') || !supabaseUrl || !anonKey) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const token = authorization.slice('Bearer '.length);
    const { data: authData, error: authError } = await userClient.auth.getUser(token);
    if (authError || !authData.user) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: employeeActive, error: statusError } = await userClient.rpc('is_current_employee_active');
    if (statusError || employeeActive !== true) {
      return new Response(JSON.stringify({ success: false, error: 'Your account is inactive.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { to, subject, html } = await req.json();

    if (!to || !subject || !html) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "to, subject and html are required",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    // Read SMTP configuration from Supabase secrets
    const smtpHost = Deno.env.get("SMTP_HOST");
    const smtpPort = Number(
      Deno.env.get("SMTP_PORT") ?? "465",
    );
    const smtpUsername = Deno.env.get("SMTP_USERNAME");
    const smtpPassword = Deno.env.get("SMTP_PASSWORD");
    const emailFrom = Deno.env.get("EMAIL_FROM");

    if (
      !smtpHost ||
      !smtpUsername ||
      !smtpPassword ||
      !emailFrom
    ) {
      throw new Error("SMTP configuration is missing");
    }

    // Create SMTP client
    const client = new SMTPClient({
      user: smtpUsername,
      password: smtpPassword,
      host: smtpHost,
      port: smtpPort,
      ssl: smtpPort === 465,
    });

    // Send email
    await client.sendAsync({
      from: emailFrom,
      to,
      subject,
      attachment: [
        {
          data: html,
          alternative: true,
        },
      ],
    });

    await client.quit();

    return new Response(
      JSON.stringify({
        success: true,
        message: "Email sent successfully",
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    console.error("Email sending failed:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error
          ? error.message
          : String(error),
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
});