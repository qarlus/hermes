import type { KeychainItemRecord, ProjectInput, ProjectRecord, ServerInput } from "@hermes/core";
import { KeychainItemEditor } from "../features/keychain/KeychainItemEditor";
import { ProjectEditor } from "../features/projects/ProjectEditor";
import { ServerEditor } from "../features/servers/ServerEditor";
import type { InspectorState } from "../lib/app";

type AppDialogsProps = {
  inspector: InspectorState;
  projectDraft: ProjectInput;
  serverDraft: ServerInput;
  projects: ProjectRecord[];
  saving: boolean;
  editingKeychainItem: KeychainItemRecord | null;
  keychainNameDraft: string;
  onProjectChange: (field: keyof ProjectInput, value: string) => void;
  onServerChange: <K extends keyof ServerInput>(field: K, value: ServerInput[K]) => void;
  onCloseInspector: () => void;
  onDeleteProject: () => void;
  onSaveProject: () => void;
  onDeleteServer: () => void;
  onSaveServer: () => void;
  onKeychainNameChange: (value: string) => void;
  onCloseKeychainEditor: () => void;
  onDeleteKeychainItem: (id: string) => void;
  onSaveKeychainItem: () => void;
};

export function AppDialogs({
  inspector,
  projectDraft,
  serverDraft,
  projects,
  saving,
  editingKeychainItem,
  keychainNameDraft,
  onProjectChange,
  onServerChange,
  onCloseInspector,
  onDeleteProject,
  onSaveProject,
  onDeleteServer,
  onSaveServer,
  onKeychainNameChange,
  onCloseKeychainEditor,
  onDeleteKeychainItem,
  onSaveKeychainItem
}: AppDialogsProps) {
  return (
    <>
      {inspector.kind === "project" ? (
        <ProjectEditor
          draft={projectDraft}
          mode={inspector.mode}
          onChange={onProjectChange}
          onClose={onCloseInspector}
          onDelete={inspector.mode === "edit" ? onDeleteProject : undefined}
          onSave={onSaveProject}
          saving={saving}
        />
      ) : null}

      {inspector.kind === "server" ? (
        <ServerEditor
          draft={serverDraft}
          mode={inspector.mode}
          onChange={onServerChange}
          onClose={onCloseInspector}
          onDelete={inspector.mode === "edit" ? onDeleteServer : undefined}
          onSave={onSaveServer}
          projects={projects}
          saving={saving}
        />
      ) : null}

      {editingKeychainItem ? (
        <KeychainItemEditor
          name={keychainNameDraft}
          onChange={onKeychainNameChange}
          onClose={onCloseKeychainEditor}
          onDelete={() => onDeleteKeychainItem(editingKeychainItem.id)}
          onSave={onSaveKeychainItem}
          saving={saving}
        />
      ) : null}
    </>
  );
}
