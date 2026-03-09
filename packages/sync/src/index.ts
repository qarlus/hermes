import type { ProjectRecord, ServerRecord } from "@hermes/core";

export interface SyncSnapshot {
  projects: ProjectRecord[];
  servers: ServerRecord[];
  exportedAt: string;
}

export interface SyncTransport {
  push(snapshot: SyncSnapshot): Promise<void>;
  pull(): Promise<SyncSnapshot | null>;
}

export const syncStatus = "placeholder";
