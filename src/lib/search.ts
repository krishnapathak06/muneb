export interface SearchResult {
  url: string;
  title: string;
  content: string;
  rawContent?: string;
}

const TAVILY_KEYS: string[] = [];
let currentKeyIndex = 0;

function getTavilyKeys(): string[] {
  if (TAVILY_KEYS.length > 0) return TAVILY_KEYS;

  const rawKey = process.env.TAVILY_API_KEY;
  if (rawKey) {
    const parts = rawKey.split(',').map((k) => k.trim()).filter(Boolean);
    TAVILY_KEYS.push(...parts);
  }

  for (let i = 1; i <= 10; i++) {
    const k = process.env[`TAVILY_API_KEY_${i}`];
    if (k && !TAVILY_KEYS.includes(k.trim())) {
      TAVILY_KEYS.push(k.trim());
    }
  }

  return TAVILY_KEYS;
}

export async function searchWeb(query: string): Promise<SearchResult[]> {
  const keys = getTavilyKeys();

  if (keys.length > 0) {
    for (let attempt = 0; attempt < keys.length; attempt++) {
      const activeIdx = (currentKeyIndex + attempt) % keys.length;
      const apiKey = keys[activeIdx];

      console.log(`[Search] Attempting Tavily Search with Key #${activeIdx + 1} of ${keys.length} for query: "${query}"`);
      try {
        const results = await searchTavilyWithStatus(query, apiKey);
        if (results !== null) {
          currentKeyIndex = activeIdx;
          return results;
        }
      } catch (err: any) {
        console.warn(`[Search] Tavily Key #${activeIdx + 1} failed: ${err.message || err}. Trying next...`);
      }
    }
    console.warn('[Search] All Tavily keys failed/exhausted. Falling back to DuckDuckGo.');
  }

  console.log(`[Search] Using DuckDuckGo Scraper for query: "${query}"`);
  return await searchDDG(query);
}

async function searchTavilyWithStatus(query: string, apiKey: string): Promise<SearchResult[] | null> {
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: 'basic',
        max_results: 5,
        include_raw_content: true,
      }),
    });

    if (res.status === 429) {
      console.warn(`[Tavily] Key rate limited (429).`);
      return null;
    }

    if (res.status === 403 || res.status === 402 || res.status === 400) {
      const text = await res.text();
      if (
        text.toLowerCase().includes('limit') ||
        text.toLowerCase().includes('credit') ||
        text.toLowerCase().includes('quota') ||
        text.toLowerCase().includes('exhausted')
      ) {
        console.warn(`[Tavily] Key limit hit (${res.status}): ${text}`);
        return null;
      }
    }

    if (!res.ok) {
      console.error(`[Tavily] HTTP Error: ${res.status}`);
      return null;
    }

    const data = await res.json();
    return (data.results ?? []).map((r: any) => ({
      url: r.url ?? '',
      title: r.title ?? '',
      content: r.content ?? '',
      rawContent: r.raw_content ?? '',
    }));
  } catch (err) {
    console.error('[Tavily] Fetch Exception:', err);
    return null;
  }
}

async function searchDDG(query: string): Promise<SearchResult[]> {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      }
    });
    if (!res.ok) {
      console.error(`[DDG] Search Failed: ${res.status}`);
      return [];
    }
    const html = await res.text();
    const results: SearchResult[] = [];
    const resultBlocks = html.split(/<div[^>]*class=['"][^'"]*result__body[^'"]*['"][^>]*>/i).slice(1);
    
    for (const block of resultBlocks) {
      const titleMatch = block.match(/<a[^>]*class=['"][^'"]*result__a[^'"]*['"][^>]*href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/i);
      const snippetMatch = block.match(/<a[^>]*class=['"][^'"]*result__snippet[^'"]*['"][^>]*>([\s\S]*?)<\/a>/i);
      
      if (titleMatch) {
        let rawUrl = titleMatch[1];
        let cleanedUrl = rawUrl;
        
        if (cleanedUrl.startsWith('//')) {
          cleanedUrl = 'https:' + cleanedUrl;
        } else if (cleanedUrl.startsWith('/')) {
          cleanedUrl = 'https://duckduckgo.com' + cleanedUrl;
        }

        if (cleanedUrl.includes('uddg=')) {
          const match = cleanedUrl.match(/uddg=([^&]+)/);
          if (match) {
            cleanedUrl = decodeURIComponent(match[1].replace(/&amp;/g, '&'));
          }
        }
        
        const title = (titleMatch[2] || '').replace(/<[^>]*>/g, '').trim();
        const snippet = snippetMatch ? (snippetMatch[1] || '').replace(/<[^>]*>/g, '').trim() : '';
        
        results.push({
          url: cleanedUrl,
          title,
          content: snippet,
          rawContent: '',
        });
      }
    }
    return results.slice(0, 5);
  } catch (err) {
    console.error('[DDG] Error:', err);
    return [];
  }
}
