import 'jsr:@supabase/functions-js/edge-runtime.d.ts';


const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders,
    });
  }

  try {
    const body = await req.json();

    const messages = body.messages as ChatMessage[];

    if (!Array.isArray(messages)) {
      return new Response(
        JSON.stringify({
          error: 'messages must be an array',
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        },
      );
    }

    const apiKey = Deno.env.get('LLM_API_KEY');

    if (!apiKey) {
      throw new Error('LLM_API_KEY is not configured');
    }

    const systemPrompt = `
You are an HR Assistant for an internal employee management system.

Be helpful, professional and concise.

For now, you do not have access to live employee database information.
Do not invent employee names, attendance records, leave balances,
salary information or company policies.

If the user asks for information that requires live company data,
clearly explain that database access is not enabled yet.
`;

    const response = await fetch(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          temperature: 0.2,
          messages: [
            {
              role: 'system',
              content: systemPrompt,
            },
            ...messages,
          ],
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();

      console.error('LLM API error:', errorText);

      return new Response(
        JSON.stringify({
          error: 'AI service request failed',
        }),
        {
          status: 502,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        },
      );
    }

    const data = await response.json();

    const answer =
      data?.choices?.[0]?.message?.content ??
      'I could not generate a response.';

    return new Response(
      JSON.stringify({
        answer,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      },
    );
  } catch (error) {
    console.error('AI chat error:', error);

    return new Response(
      JSON.stringify({
        error: 'Unable to process your request.',
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      },
    );
  }
});