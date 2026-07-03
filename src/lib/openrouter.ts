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

const queue: (() => void)[] = [];
const requestTimestamps: number[] = [];
const RATE_LIMIT_MAX_REQUESTS = 13;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
let processing = false;

async function acquireToken(): Promise<void> {
  return new Promise<void>((resolve) => {
    queue.push(resolve);
    processQueue();
  });
}

async function processQueue() {
  if (processing) return;
  processing = true;

  while (queue.length > 0) {
    const now = Date.now();
    while (requestTimestamps.length > 0 && requestTimestamps[0] < now - RATE_LIMIT_WINDOW_MS) {
      requestTimestamps.shift();
    }

    if (requestTimestamps.length < RATE_LIMIT_MAX_REQUESTS) {
      requestTimestamps.push(now);
      const nextResolve = queue.shift();
      if (nextResolve) nextResolve();
    } else {
      const oldestTime = requestTimestamps[0];
      const waitTime = oldestTime + RATE_LIMIT_WINDOW_MS - now;
      if (waitTime > 0) {
        console.log(`[RateLimiter] Rolling window limit reached. Waiting ${Math.round(waitTime / 1000)}s...`);
        await new Promise(r => setTimeout(r, waitTime));
      }
    }
  }

  processing = false;
}

export async function chat(
  messages: ChatMessage[],
  opts?: { temperature?: number; maxTokens?: number }
): Promise<ChatResult> {
  await acquireToken();
  const response = await client.chat.completions.create({
    model: MODEL,
    messages,
    temperature: opts?.temperature ?? 0.3,
    max_tokens: opts?.maxTokens ?? 4096,
  });

  if (!response) {
    throw new Error('Empty response from OpenRouter API');
  }

  // Handle case where OpenRouter returned a JSON error payload (e.g. overloaded)
  if ((response as any).error) {
    const errObj = (response as any).error;
    throw new Error(`OpenRouter Error ${errObj.code || ''}: ${errObj.message || 'Unknown'}`);
  }

  if (!response.choices || response.choices.length === 0) {
    throw new Error('OpenRouter response contains no choices (model may be overloaded or down)');
  }

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
      
      const status = (err as { status?: number })?.status;
      const isPermanent = status === 400 || status === 401 || status === 403;

      if (isPermanent) {
        throw err;
      }

      if (attempt === maxRetries - 1) {
        throw err;
      }

      // Exponential backoff: 2s, 4s, 8s, 16s, 32s
      const delay = Math.pow(2, attempt + 1) * 1000 + Math.random() * 500;
      console.log(`[OpenRouter] Attempt ${attempt + 1} failed (${(err as Error).message}). Retrying in ${Math.round(delay / 1000)}s...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}
