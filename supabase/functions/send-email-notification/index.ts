import { SMTPClient } from "npm:emailjs@4.0.3";

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