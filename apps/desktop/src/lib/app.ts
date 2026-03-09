import {
  type ProjectInput,
  type ServerInput,
  type ServerRecord
} from "@hermes/core";

export type InspectorState =
  | { kind: "hidden" }
  | { kind: "project"; mode: "create" | "edit" }
  | { kind: "server"; mode: "create" | "edit" };

export type ViewState = "dashboard" | "workspace" | "keychain";

export function normalizeProjectInput(input: ProjectInput): ProjectInput {
  return {
    name: input.name.trim(),
    description: input.description.trim()
  };
}

export function normalizeServerInput(input: ServerInput): ServerInput {
  return {
    ...input,
    projectId: input.projectId.trim(),
    name: input.name.trim(),
    hostname: input.hostname.trim(),
    username: input.username.trim(),
    credentialName: input.credentialName.trim(),
    credentialSecret:
      input.authKind === "password" ? input.credentialSecret : input.credentialSecret.trim(),
    tmuxSession: input.tmuxSession.trim() || "main",
    notes: input.notes.trim(),
    port: Number.isFinite(input.port) ? input.port : 22
  };
}

export function mapServerToInput(server: ServerRecord): ServerInput {
  return {
    projectId: server.projectId,
    name: server.name,
    hostname: server.hostname,
    port: server.port,
    username: server.username,
    authKind: server.authKind,
    credentialId: server.credentialId,
    credentialName: server.credentialName ?? "",
    credentialSecret: "",
    tmuxSession: server.tmuxSession,
    useTmux: server.useTmux,
    notes: server.notes
  };
}

export function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
