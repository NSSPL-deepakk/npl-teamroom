import { supabase } from "../lib/supabase";

type SendEmailParams = {
  to: string;
  subject: string;
  html: string;
};

type SendEmailResponse = {
  success: boolean;
  message?: string;
  error?: string;
};

export async function sendEmail({
  to,
  subject,
  html,
}: SendEmailParams): Promise<SendEmailResponse> {
  const { data, error } =
    await supabase.functions.invoke<SendEmailResponse>(
      "send-email-notification",
      {
        body: {
          to,
          subject,
          html,
        },
      },
    );

  if (error) {
    console.error("Email function error:", error);
    throw new Error(error.message || "Failed to send email");
  }

  if (!data?.success) {
    throw new Error(data?.error || "Failed to send email");
  }

  return data;
}