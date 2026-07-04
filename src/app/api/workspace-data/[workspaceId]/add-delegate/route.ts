import { NextRequest, NextResponse } from 'next/server';
import { readWorkspaceFile, writeWorkspaceFile, getWorkspace, updateWorkspace } from '@/lib/workspace';

export async function POST(
  req: NextRequest,
  { params }: { params: { workspaceId: string } }
) {
  try {
    const { workspaceId } = params;
    const ws = getWorkspace(workspaceId);
    if (!ws) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }

    const { countryName } = await req.json();
    if (!countryName || typeof countryName !== 'string' || !countryName.trim()) {
      return NextResponse.json({ error: 'Country name is required' }, { status: 400 });
    }

    const trimmedName = countryName.trim();
    const id = trimmedName.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    // Read current countries
    const countriesList = readWorkspaceFile<{ id: string; name: string }[]>(workspaceId, 'countries.json') ?? [];

    // Check for duplicates
    if (countriesList.some((c) => c.id === id || c.name.toLowerCase() === trimmedName.toLowerCase())) {
      return NextResponse.json({ error: 'Delegate already exists in this session' }, { status: 400 });
    }

    // Append new country
    const newCountry = { id, name: trimmedName };
    const updatedCountries = [...countriesList, newCountry];

    // Write back to countries.json
    writeWorkspaceFile(workspaceId, 'countries.json', updatedCountries);

    // Update workspace record with list of country names
    const currentCountryNames = ws.countries ?? [];
    if (!currentCountryNames.includes(trimmedName)) {
      updateWorkspace(workspaceId, {
        countries: [...currentCountryNames, trimmedName],
      });
    }

    return NextResponse.json({ success: true, country: newCountry });
  } catch (err) {
    console.error('[add-delegate]', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
