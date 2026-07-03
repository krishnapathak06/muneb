import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY ?? '',
  defaultHeaders: {
    'HTTP-Referer': 'https://github.com/mun-research-tool',
    'X-Title': 'MUN EB Research Tool',
  },
});

export const MODEL = 'google/gemma-4-31b-it:free';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatResult {
  content: string;
  citations: { url: string; title: string; content: string }[];
}

export async function chat(
  messages: ChatMessage[],
  opts?: { temperature?: number; maxTokens?: number }
): Promise<ChatResult> {
  const response = await client.chat.completions.create({
    model: MODEL,
    messages,
    temperature: opts?.temperature ?? 0.3,
    max_tokens: opts?.maxTokens ?? 4096,
  });

  const message = response.choices[0]?.message as any;
  const content = message?.content ?? '';
  const annotations = message?.annotations ?? [];
  const citations = annotations
    .filter((ann: any) => ann.type === 'url_citation' && ann.url_citation)
    .map((ann: any) => ({
      url: ann.url_citation.url ?? '',
      title: ann.url_citation.title ?? '',
      content: ann.url_citation.content ?? '',
    }));

  return { content, citations };
}

export async function chatWithRetry(
  messages: ChatMessage[],
  opts?: { temperature?: number; maxTokens?: number; maxRetries?: number }
): Promise<ChatResult> {
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
