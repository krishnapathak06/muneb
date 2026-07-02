import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY ?? '',
  defaultHeaders: {
    'HTTP-Referer': 'https://github.com/mun-research-tool',
    'X-Title': 'MUN EB Research Tool',
  },
});

export const MODEL = 'google/gemma-3-27b-it:online';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function chat(
  messages: ChatMessage[],
  opts?: { temperature?: number; maxTokens?: number }
): Promise<string> {
  const response = await client.chat.completions.create({
    model: MODEL,
    messages,
    temperature: opts?.temperature ?? 0.3,
    max_tokens: opts?.maxTokens ?? 4096,
  });
  return response.choices[0]?.message?.content ?? '';
}

export async function chatWithRetry(
  messages: ChatMessage[],
  opts?: { temperature?: number; maxTokens?: number; maxRetries?: number }
): Promise<string> {
  const maxRetries = opts?.maxRetries ?? 5;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await chat(messages, opts);
    } catch (err: unknown) {
      lastError = err as Error;
      const isRateLimit =
        (err as { status?: number })?.status === 429 ||
        (err instanceof Error && err.message?.includes('rate limit'));

      if (!isRateLimit && attempt > 1) throw err;

      // Exponential backoff: 2s, 4s, 8s, 16s, 32s
      const delay = Math.pow(2, attempt + 1) * 1000 + Math.random() * 500;
      console.log(`[OpenRouter] Attempt ${attempt + 1} failed (${(err as Error).message}). Retrying in ${Math.round(delay / 1000)}s...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}
