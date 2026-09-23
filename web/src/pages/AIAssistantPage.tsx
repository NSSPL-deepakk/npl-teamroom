import { useState } from 'react';
import { supabase } from '../lib/supabase';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

export default function AIAssistantPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: crypto.randomUUID(),
      role: 'assistant',
      content:
        'Hi! I am your HR Assistant. How can I help you today?',
    },
  ]);

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  async function sendMessage() {
    const message = input.trim();

    if (!message || loading) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: message,
    };

    setMessages((current) => [...current, userMessage]);
    setInput('');
    setLoading(true);

    try {
      // We will connect Supabase Edge Function here in Step 3.
      const { data, error } = await supabase.functions.invoke('ai-chat', {
  body: {
    messages: [...messages, userMessage].map((item) => ({
      role: item.role,
      content: item.content,
    })),
  },
});

if (error) {
  throw error;
}

const response =
  data?.answer ?? 'I could not generate a response.';

      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: response,
        },
      ]);
    } catch (error) {
      console.error(error);

      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: 'Sorry, something went wrong.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full min-h-[calc(100vh-120px)] flex-col bg-white">
      {/* Header */}
      <div className="border-b border-slate-200 px-6 py-4">
        <h1 className="text-xl font-semibold text-slate-900">
          AI HR Assistant
        </h1>

        <p className="mt-1 text-sm text-slate-500">
          Ask questions about employees, attendance, leave and HR policies.
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-5 overflow-y-auto p-6">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${
              message.role === 'user'
                ? 'justify-end'
                : 'justify-start'
            }`}
          >
            <div
              className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm ${
                message.role === 'user'
                  ? 'bg-slate-900 text-white'
                  : 'border border-slate-200 bg-slate-50 text-slate-800'
              }`}
            >
              {message.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
              AI is thinking...
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-slate-200 p-4">
        <div className="mx-auto flex max-w-4xl gap-3">
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void sendMessage();
              }
            }}
            placeholder="Ask your HR assistant..."
            disabled={loading}
            className="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500"
          />

          <button
            onClick={() => void sendMessage()}
            disabled={!input.trim() || loading}
            className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}