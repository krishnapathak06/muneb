import { NextRequest, NextResponse } from 'next/server';
import { parsePdf, extractIntakeData, parseXlsx } from '@/lib/parsers/intake-parser';
import { updateWorkspace, writeWorkspaceFile } from '@/lib/workspace';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';


export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const workspaceId = formData.get('workspaceId') as string;
    const bgFile = formData.get('backgroundGuide') as File | null;
    const portfolioFile = formData.get('portfolioMatrix') as File | null;

    if (!workspaceId || !bgFile || !portfolioFile) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Parse Background Guide
    const bgBuffer = Buffer.from(await bgFile.arrayBuffer());
    const { text: bgText } = await parsePdf(bgBuffer);
    const intakeData = extractIntakeData(bgText);

    // Save BG to intake/
    const wsDir = path.join(process.cwd(), 'workspaces', workspaceId);
    fs.writeFileSync(path.join(wsDir, 'intake', 'background_guide.pdf'), bgBuffer);

    // Parse Portfolio Matrix
    const portfolioBuffer = Buffer.from(await portfolioFile.arrayBuffer());
    const portfolioName = portfolioFile.name.toLowerCase();

    let portfolioCountries: string[] = [];
    if (portfolioName.endsWith('.xlsx') || portfolioName.endsWith('.xls')) {
      portfolioCountries = await parseXlsx(portfolioBuffer);
    } else if (portfolioName.endsWith('.pdf')) {
      const { text: portfolioText } = await parsePdf(portfolioBuffer);
      const portfolioData = extractIntakeData(portfolioText);
      portfolioCountries = portfolioData.countries;
    }
    fs.writeFileSync(path.join(wsDir, 'intake', 'portfolio_matrix.bin'), portfolioBuffer);

    // Merge country lists (portfolio matrix is authoritative, BG supplemental)
    const mergedCountries: string[] = [];
    for (const c of [...portfolioCountries, ...intakeData.countries]) {
      if (!mergedCountries.includes(c)) {
        mergedCountries.push(c);
      }
    }

    return NextResponse.json({
      committee: intakeData.committee,
      agenda: intakeData.agenda,
      countries: mergedCountries,
      confidence: intakeData.confidence,
      confidenceNotes: intakeData.confidenceNotes,
      rawText: bgText.slice(0, 3000), // send first 3k chars for manual review
    });
  } catch (err) {
    console.error('[intake]', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
