import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const WORKSPACES_DIR = path.join(process.cwd(), 'workspaces');

export type WorkspaceStatus =
  | 'intake'
  | 'sub-issues'
  | 'researching'
  | 'done';

export interface WorkspaceMeta {
  id: string;
  name: string;
  committee: string;
  agenda: string;
  createdAt: string;
  status: WorkspaceStatus;
}

function ensureWorkspacesDir() {
  if (!fs.existsSync(WORKSPACES_DIR)) {
    fs.mkdirSync(WORKSPACES_DIR, { recursive: true });
  }
}

export function listWorkspaces(): WorkspaceMeta[] {
  ensureWorkspacesDir();
  const dirs = fs.readdirSync(WORKSPACES_DIR).filter((d) => {
    const full = path.join(WORKSPACES_DIR, d);
    return fs.statSync(full).isDirectory();
  });
  const workspaces: WorkspaceMeta[] = [];
  for (const dir of dirs) {
    const metaPath = path.join(WORKSPACES_DIR, dir, 'workspace.json');
    if (fs.existsSync(metaPath)) {
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        workspaces.push(meta);
      } catch {
        // skip corrupt
      }
    }
  }
  return workspaces.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function createWorkspace(name: string): WorkspaceMeta {
  ensureWorkspacesDir();
  const id = uuidv4();
  const meta: WorkspaceMeta = {
    id,
    name,
    committee: '',
    agenda: '',
    createdAt: new Date().toISOString(),
    status: 'intake',
  };
  const wsDir = path.join(WORKSPACES_DIR, id);
  fs.mkdirSync(wsDir, { recursive: true });
  fs.mkdirSync(path.join(wsDir, 'intake'), { recursive: true });
  fs.mkdirSync(path.join(wsDir, 'research'), { recursive: true });
  fs.mkdirSync(path.join(wsDir, 'qna'), { recursive: true });
  fs.writeFileSync(path.join(wsDir, 'workspace.json'), JSON.stringify(meta, null, 2));
  return meta;
}

export function getWorkspace(id: string): WorkspaceMeta | null {
  const metaPath = path.join(WORKSPACES_DIR, id, 'workspace.json');
  if (!fs.existsSync(metaPath)) return null;
  return JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
}

export function updateWorkspace(id: string, updates: Partial<WorkspaceMeta>): WorkspaceMeta {
  const ws = getWorkspace(id);
  if (!ws) throw new Error(`Workspace ${id} not found`);
  const updated = { ...ws, ...updates };
  const metaPath = path.join(WORKSPACES_DIR, id, 'workspace.json');
  fs.writeFileSync(metaPath, JSON.stringify(updated, null, 2));
  return updated;
}

export function getWorkspaceDir(id: string): string {
  return path.join(WORKSPACES_DIR, id);
}

export function readWorkspaceFile<T>(id: string, relativePath: string): T | null {
  const fullPath = path.join(WORKSPACES_DIR, id, relativePath);
  if (!fs.existsSync(fullPath)) return null;
  return JSON.parse(fs.readFileSync(fullPath, 'utf-8')) as T;
}

export function writeWorkspaceFile(id: string, relativePath: string, data: unknown): void {
  const fullPath = path.join(WORKSPACES_DIR, id, relativePath);
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(fullPath, JSON.stringify(data, null, 2));
}
