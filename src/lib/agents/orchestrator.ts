import { runCountryAgent, AgendaData, CountryResearchResult } from './country-agent';
import { writeWorkspaceFile } from '@/lib/workspace';

export type CountryStatus = 'queued' | 'researching' | 'done' | 'failed';

export interface OrchestratorProgress {
  [countryId: string]: {
    name: string;
    status: CountryStatus;
    stage?: string;
    error?: string;
    startedAt?: string;
    completedAt?: string;
    embeddedCount?: number;
  };
}

const MAX_CONCURRENCY = 5; // conservative for free-tier rate limits

export async function orchestrateResearch(
  workspaceId: string,
  countries: { id: string; name: string }[],
  committee: string,
  agendaData: AgendaData
): Promise<OrchestratorProgress> {
  const progress: OrchestratorProgress = {};

  // Initialize all as queued
  for (const country of countries) {
    progress[country.id] = { name: country.name, status: 'queued' };
  }
  writeWorkspaceFile(workspaceId, 'research_progress.json', progress);

  // Process in batches of MAX_CONCURRENCY
  const chunks: typeof countries[] = [];
  for (let i = 0; i < countries.length; i += MAX_CONCURRENCY) {
    chunks.push(countries.slice(i, i + MAX_CONCURRENCY));
  }

  for (const chunk of chunks) {
    await Promise.all(
      chunk.map(async (country) => {
        progress[country.id].status = 'researching';
        progress[country.id].startedAt = new Date().toISOString();
        writeWorkspaceFile(workspaceId, 'research_progress.json', progress);

        const result = await runCountryAgent(
          workspaceId,
          country.name,
          country.id,
          committee,
          agendaData,
          (stage, embeddedCount) => {
            progress[country.id].stage = stage;
            if (embeddedCount !== undefined) {
              progress[country.id].embeddedCount = embeddedCount;
            }
            writeWorkspaceFile(workspaceId, 'research_progress.json', progress);
          }
        );

        progress[country.id].status = result.status;
        progress[country.id].completedAt = new Date().toISOString();
        if (result.error) {
          progress[country.id].error = result.error;
        } else {
          // Double check final count of verified sources
          const allSources = [
            ...(result.mainAgenda?.sources ?? []),
            ...Object.values(result.subIssues ?? {}).flatMap((s) => s.sources ?? []),
          ];
          progress[country.id].embeddedCount = allSources.filter(s => s.verified).length;
        }
        writeWorkspaceFile(workspaceId, 'research_progress.json', progress);
      })
    );
  }

  return progress;
}
