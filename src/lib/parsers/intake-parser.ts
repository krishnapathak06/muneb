import { chatWithRetry } from '@/lib/openrouter';

// Known country names for heuristic matching
export const KNOWN_COUNTRIES = [
  'Afghanistan', 'Albania', 'Algeria', 'Andorra', 'Angola', 'Antigua and Barbuda',
  'Argentina', 'Armenia', 'Australia', 'Austria', 'Azerbaijan', 'Bahamas', 'Bahrain',
  'Bangladesh', 'Barbados', 'Belarus', 'Belgium', 'Belize', 'Benin', 'Bhutan',
  'Bolivia', 'Bosnia and Herzegovina', 'Botswana', 'Brazil', 'Brunei', 'Bulgaria',
  'Burkina Faso', 'Burundi', 'Cabo Verde', 'Cambodia', 'Cameroon', 'Canada',
  'Central African Republic', 'Chad', 'Chile', 'China', 'Colombia', 'Comoros',
  'Congo', 'Costa Rica', 'Croatia', 'Cuba', 'Cyprus', 'Czech Republic', 'Denmark',
  'Djibouti', 'Dominica', 'Dominican Republic', 'Ecuador', 'Egypt', 'El Salvador',
  'Equatorial Guinea', 'Eritrea', 'Estonia', 'Eswatini', 'Ethiopia', 'Fiji',
  'Finland', 'France', 'Gabon', 'Gambia', 'Georgia', 'Germany', 'Ghana', 'Greece',
  'Grenada', 'Guatemala', 'Guinea', 'Guinea-Bissau', 'Guyana', 'Haiti', 'Honduras',
  'Hungary', 'Iceland', 'India', 'Indonesia', 'Iran', 'Iraq', 'Ireland', 'Israel',
  'Italy', 'Jamaica', 'Japan', 'Jordan', 'Kazakhstan', 'Kenya', 'Kiribati',
  'Kuwait', 'Kyrgyzstan', 'Laos', 'Latvia', 'Lebanon', 'Lesotho', 'Liberia',
  'Libya', 'Liechtenstein', 'Lithuania', 'Luxembourg', 'Madagascar', 'Malawi',
  'Malaysia', 'Maldives', 'Mali', 'Malta', 'Marshall Islands', 'Mauritania',
  'Mauritius', 'Mexico', 'Micronesia', 'Moldova', 'Monaco', 'Mongolia',
  'Montenegro', 'Morocco', 'Mozambique', 'Myanmar', 'Namibia', 'Nauru', 'Nepal',
  'Netherlands', 'New Zealand', 'Nicaragua', 'Niger', 'Nigeria', 'North Korea',
  'North Macedonia', 'Norway', 'Oman', 'Pakistan', 'Palau', 'Panama',
  'Papua New Guinea', 'Paraguay', 'Peru', 'Philippines', 'Poland', 'Portugal',
  'Qatar', 'Romania', 'Russia', 'Rwanda', 'Saint Kitts and Nevis', 'Saint Lucia',
  'Saint Vincent and the Grenadines', 'Samoa', 'San Marino', 'Sao Tome and Principe',
  'Saudi Arabia', 'Senegal', 'Serbia', 'Seychelles', 'Sierra Leone', 'Singapore',
  'Slovakia', 'Slovenia', 'Solomon Islands', 'Somalia', 'South Africa',
  'South Korea', 'South Sudan', 'Spain', 'Sri Lanka', 'Sudan', 'Suriname',
  'Sweden', 'Switzerland', 'Syria', 'Taiwan', 'Tajikistan', 'Tanzania', 'Thailand',
  'Timor-Leste', 'Togo', 'Tonga', 'Trinidad and Tobago', 'Tunisia', 'Turkey',
  'Turkmenistan', 'Tuvalu', 'Uganda', 'Ukraine', 'United Arab Emirates',
  'United Kingdom', 'United States', 'Uruguay', 'Uzbekistan', 'Vanuatu',
  'Venezuela', 'Vietnam', 'Yemen', 'Zambia', 'Zimbabwe'
];

export interface ParsedIntake {
  committee: string;
  agenda: string;
  countries: string[];
  subIssues: { title: string; description: string }[];
  rawText: string;
  confidence: 'high' | 'medium' | 'low';
  confidenceNotes: string[];
}

export function getCanonicalCountry(name: string): string {
  const cleaned = name.trim().toLowerCase().replace(/[\s,()\-._]+/g, ' ').trim();
  
  const mapping: Record<string, string> = {
    'usa': 'United States',
    'united states of america': 'United States',
    'united states': 'United States',
    'uk': 'United Kingdom',
    'great britain': 'United Kingdom',
    'united kingdom': 'United Kingdom',
    'uae': 'United Arab Emirates',
    'united arab emirates': 'United Arab Emirates',
    'drc': 'Democratic Republic of the Congo',
    'democratic republic of the congo': 'Democratic Republic of the Congo',
    'congo democratic republic of the': 'Democratic Republic of the Congo',
    'republic of the congo': 'Congo',
    'congo': 'Congo',
    'republic of korea': 'South Korea',
    'south korea': 'South Korea',
    'korea republic of': 'South Korea',
    'korea rep': 'South Korea',
    'north korea': 'North Korea',
    'democratic people\'s republic of korea': 'North Korea',
    'korea democratic people\'s republic of': 'North Korea',
    'dprk': 'North Korea',
    'peoples republic of china': 'China',
    'prc': 'China',
    'china': 'China',
    'russian federation': 'Russia',
    'russia': 'Russia',
    'islamic republic of iran': 'Iran',
    'iran': 'Iran',
    'iran islamic republic of': 'Iran',
    'bolivarian republic of venezuela': 'Venezuela',
    'venezuela': 'Venezuela',
    'venezuela bolivarian republic of': 'Venezuela',
    'syrian arab republic': 'Syria',
    'syria': 'Syria',
    'viet nam': 'Vietnam',
    'vietnam': 'Vietnam',
    'bolivia plurinational state of': 'Bolivia',
    'bolivia': 'Bolivia',
    'lao peoples democratic republic': 'Laos',
    'laos': 'Laos',
  };

  if (mapping[cleaned]) {
    return mapping[cleaned];
  }

  // Check if any mapping key matches as a whole word
  for (const [key, canonical] of Object.entries(mapping)) {
    const regex = new RegExp(`\\b${key}\\b`, 'i');
    if (regex.test(cleaned)) {
      return canonical;
    }
  }

  // Check if any of KNOWN_COUNTRIES matches or is contained
  for (const country of KNOWN_COUNTRIES) {
    const countryLower = country.toLowerCase();
    const regex = new RegExp(`\\b${countryLower}\\b`, 'i');
    if (regex.test(cleaned)) {
      return country;
    }
  }

  return '';
}

export async function parsePdf(buffer: Buffer): Promise<{ text: string; pages: number }> {
  const pdfParse = (await import('pdf-parse')).default;
  const data = await pdfParse(buffer);
  return { text: data.text, pages: data.numpages };
}

export function extractIntakeData(text: string): ParsedIntake {
  const notes: string[] = [];
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  // --- Committee extraction ---
  let committee = '';
  const committeePatterns = [
    /committee\s*[:–-]\s*(.+)/i,
    /^([A-Z][A-Z\s&]+(?:COMMITTEE|COUNCIL|ASSEMBLY|BOARD|COMMISSION))/m,
  ];
  for (const p of committeePatterns) {
    const m = text.match(p);
    if (m) { committee = m[1].trim(); break; }
  }
  if (!committee) notes.push('Could not auto-detect committee name — please set manually.');

  // --- Agenda extraction ---
  let agenda = '';
  const agendaPatterns = [
    /agenda\s*(?:item)?\s*[:–-]\s*(.+)/i,
    /topic\s*[:–-]\s*(.+)/i,
    /resolution\s*on\s+(.+)/i,
  ];
  for (const p of agendaPatterns) {
    const m = text.match(p);
    if (m) { agenda = m[1].trim().replace(/\n[\s\S]*/, '').trim(); break; }
  }
  if (!agenda) notes.push('Could not auto-detect agenda title — please set manually.');

  // --- Country extraction ---
  const foundCountries: string[] = [];
  // Strategy 1: line-by-line match against known country set
  for (const line of lines) {
    const cleaned = line.replace(/^[\d.\-–•*]+\s*/, '').trim();
    const canonical = getCanonicalCountry(cleaned);
    if (canonical && KNOWN_COUNTRIES.includes(canonical)) {
      if (!foundCountries.includes(canonical)) foundCountries.push(canonical);
    }
  }
  // Strategy 2: inline mentions
  if (foundCountries.length < 3) {
    for (const country of KNOWN_COUNTRIES) {
      const regex = new RegExp(`\\b${country}\\b`, 'i');
      if (regex.test(text)) {
        const canonical = getCanonicalCountry(country);
        if (canonical && KNOWN_COUNTRIES.includes(canonical)) {
          if (!foundCountries.includes(canonical)) foundCountries.push(canonical);
        }
      }
    }
  }

  if (foundCountries.length === 0) notes.push('No countries detected — please enter the country list manually.');
  else if (foundCountries.length < 5) notes.push(`Only ${foundCountries.length} countries detected — verify this list is complete.`);

  // Fallback sub-issues
  const subIssues = [
    { title: 'Implementation & Funding', description: 'Assessing the financial mechanisms and policy frameworks needed to implement the main agenda.' },
    { title: 'Sovereignty & International Cooperation', description: 'Balancing national sovereignty against collective international commitments on this issue.' },
    { title: 'Capacity Building & Technology Transfer', description: 'Assisting developing nations in adopting technologies and building resources to meet targets.' },
    { title: 'Monitoring & Accountability', description: 'Establishing global standards, transparency reports, and compliance frameworks.' }
  ];

  // --- Confidence scoring ---
  let confidence: 'high' | 'medium' | 'low' = 'high';
  if (notes.length >= 3) confidence = 'low';
  else if (notes.length >= 1) confidence = 'medium';

  return { committee, agenda, countries: foundCountries, subIssues, rawText: text, confidence, confidenceNotes: notes };
}

export async function extractIntakeDataWithLLM(text: string): Promise<ParsedIntake> {
  // Let it parse a very generous chunk of the PDF text to ensure it finds sub-issues even at the end
  const sample = text.slice(0, 150000);
  
  const systemPrompt = "You are a helpful assistant that extracts MUN committee names, agendas, participating countries, and proposed sub-issues from background guides. Always respond in JSON format.";
  
  const userPrompt = `Given the following background guide, extract:
1. The exact name of the committee (e.g., UNEP, DISEC, UN Security Council).
2. The main agenda topic (e.g., marine plastic pollution, outer space militarization).
3. Any participating countries explicitly listed in the guide.
4. Exactly 4-5 key sub-issues (sub-topics) that meaningfully break down the main agenda. Look for sections like "Sub-topics", "Questions to Address", "Key Issues", or analyze the text of the guide to propose them.

Provide your response in this EXACT JSON structure, with no markdown formatting or extra text:
{
  "committee": "extracted committee name or empty string if not found",
  "agenda": "extracted agenda topic or empty string if not found",
  "countries": ["country1", "country2"],
  "subIssues": [
    {
      "title": "Short, specific sub-issue title (3-8 words)",
      "description": "1-2 sentence description of what this sub-issue covers and why it matters"
    }
  ]
}

Background Guide Text:
${sample}`;

  try {
    const chatResult = await chatWithRetry([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], { maxTokens: 1500, temperature: 0.2 });

    const parsed = JSON.parse(chatResult.content);
    
    // Canonicalize country names
    const canonicalCountries: string[] = [];
    if (Array.isArray(parsed.countries)) {
      for (const rawCountry of parsed.countries) {
        const canonical = getCanonicalCountry(rawCountry);
        if (canonical && KNOWN_COUNTRIES.includes(canonical) && !canonicalCountries.includes(canonical)) {
          canonicalCountries.push(canonical);
        }
      }
    }

    const subIssues = (parsed.subIssues ?? []).map((si: any) => ({
      title: String(si.title || '').trim(),
      description: String(si.description || '').trim()
    })).filter((si: any) => si.title);

    const notes: string[] = [];
    if (!parsed.committee) notes.push('Could not detect committee name.');
    if (!parsed.agenda) notes.push('Could not detect agenda topic.');
    if (canonicalCountries.length === 0) notes.push('No countries detected.');
    if (subIssues.length === 0) notes.push('No sub-issues detected.');

    let confidence: 'high' | 'medium' | 'low' = 'high';
    if (notes.length >= 2) confidence = 'low';
    else if (notes.length >= 1) confidence = 'medium';

    // Fallback sub-issues if LLM missed them entirely
    const finalSubIssues = subIssues.length > 0 ? subIssues : [
      { title: 'Implementation & Funding', description: 'Assessing the financial mechanisms and policy frameworks needed to implement the main agenda.' },
      { title: 'Sovereignty & International Cooperation', description: 'Balancing national sovereignty against collective international commitments on this issue.' },
      { title: 'Capacity Building & Technology Transfer', description: 'Assisting developing nations in adopting technologies and building resources to meet targets.' },
      { title: 'Monitoring & Accountability', description: 'Establishing global standards, transparency reports, and compliance frameworks.' }
    ];

    return {
      committee: parsed.committee || '',
      agenda: parsed.agenda || '',
      countries: canonicalCountries,
      subIssues: finalSubIssues,
      rawText: text,
      confidence,
      confidenceNotes: notes
    };
  } catch (err) {
    console.error('[extractIntakeDataWithLLM] failed, falling back to rule-based', err);
    return extractIntakeData(text);
  }
}

export async function parseXlsx(buffer: Buffer): Promise<string[]> {
  const xlsxModule = await import('xlsx') as any;
  const XLSX = xlsxModule.read ? xlsxModule : (xlsxModule.default || xlsxModule);
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const countries: string[] = [];
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const rows: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    for (const row of rows) {
      for (const cell of row) {
        const val = String(cell ?? '').trim();
        const canonical = getCanonicalCountry(val);
        if (canonical && KNOWN_COUNTRIES.includes(canonical) && !countries.includes(canonical)) {
          countries.push(canonical);
        }
      }
    }
  }
  return countries;
}
