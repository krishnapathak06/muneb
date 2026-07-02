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
  'Venezuela', 'Vietnam', 'Yemen', 'Zambia', 'Zimbabwe',
  // Common abbreviations / alternates used in MUN
  'USA', 'UK', 'UAE', 'DRC', 'Democratic Republic of the Congo',
  'Republic of Korea', 'People\'s Republic of China', 'Russian Federation',
  'Islamic Republic of Iran', 'Bolivarian Republic of Venezuela',
];

export interface ParsedIntake {
  committee: string;
  agenda: string;
  countries: string[];
  rawText: string;
  confidence: 'high' | 'medium' | 'low';
  confidenceNotes: string[];
}

export async function parsePdf(buffer: Buffer): Promise<{ text: string; pages: number }> {
  // Dynamic import to keep server-side only
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
    if (KNOWN_COUNTRIES.includes(cleaned)) {
      if (!foundCountries.includes(cleaned)) foundCountries.push(cleaned);
    }
  }
  // Strategy 2: inline mentions
  if (foundCountries.length < 3) {
    for (const country of KNOWN_COUNTRIES) {
      const regex = new RegExp(`\\b${country}\\b`, 'i');
      if (regex.test(text) && !foundCountries.includes(country)) {
        foundCountries.push(country);
      }
    }
  }

  if (foundCountries.length === 0) notes.push('No countries detected — please enter the country list manually.');
  else if (foundCountries.length < 5) notes.push(`Only ${foundCountries.length} countries detected — verify this list is complete.`);

  // --- Confidence scoring ---
  let confidence: 'high' | 'medium' | 'low' = 'high';
  if (notes.length >= 3) confidence = 'low';
  else if (notes.length >= 1) confidence = 'medium';

  return { committee, agenda, countries: foundCountries, rawText: text, confidence, confidenceNotes: notes };
}

export async function parseXlsx(buffer: Buffer): Promise<string[]> {
  const XLSX = (await import('xlsx')).default;
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const countries: string[] = [];
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const rows: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    for (const row of rows) {
      for (const cell of row) {
        const val = String(cell ?? '').trim();
        if (KNOWN_COUNTRIES.includes(val) && !countries.includes(val)) {
          countries.push(val);
        }
      }
    }
  }
  return countries;
}
