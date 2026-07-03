export interface SearchResult {
  url: string;
  title: string;
  content: string;
}

export async function searchWeb(query: string): Promise<SearchResult[]> {
  const tavilyKey = process.env.TAVILY_API_KEY;
  if (tavilyKey) {
    console.log(`[Search] Using Tavily Search API for query: "${query}"`);
    const results = await searchTavily(query, tavilyKey);
    if (results.length > 0) return results;
  }

  console.log(`[Search] Using DuckDuckGo Scraper for query: "${query}"`);
  return await searchDDG(query);
}

async function searchTavily(query: string, apiKey: string): Promise<SearchResult[]> {
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: 'basic',
        max_results: 5,
      }),
    });
    if (!res.ok) {
      console.error(`[Tavily] API Error: ${res.status}`);
      return [];
    }
    const data = await res.json();
    return (data.results ?? []).map((r: any) => ({
      url: r.url ?? '',
      title: r.title ?? '',
      content: r.content ?? '',
    }));
  } catch (err) {
    console.error('[Tavily] Error:', err);
    return [];
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
          content: snippet
        });
      }
    }
    return results.slice(0, 5);
  } catch (err) {
    console.error('[DDG] Error:', err);
    return [];
  }
}
