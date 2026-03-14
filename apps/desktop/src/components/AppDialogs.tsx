import type {
  GitHubRepositoryRecord,
  KeychainItemKind,
  KeychainItemRecord,
  ProjectInput,
  ProjectRecord,
  ServerRecord,
  ServerInput
} from "@hermes/core";
import { KeychainItemEditor } from "../features/keychain/KeychainItemEditor";
import { LocalSshKeyEditor } from "../features/keychain/LocalSshKeyEditor";
import { ProjectEditor } from "../features/projects/ProjectEditor";
import { ServerEditor } from "../features/servers/ServerEditor";
import type { InspectorState } from "../lib/app";

type AppDialogsProps = {
  inspector: InspectorState;
  projectDraft: ProjectInput;
  serverDraft: ServerInput;
  projects: ProjectRecord[];
  servers: ServerRecord[];
  gitHubRepositories: GitHubRepositoryRecord[];
  keychainItems: KeychainItemRecord[];
  saving: boolean;
  editingKeychainItem: KeychainItemRecord | null;
  creatingKeychainItem: boolean;
  creatingLocalSshKey: boolean;
  keychainNameDraft: string;
  keychainKindDraft: KeychainItemKind;
  keychainSecretDraft: string;
  localSshKeyDirectoryDraft: string;
  localSshKeyFileNameDraft: string;
  localSshKeyPassphraseDraft: string;
  onProjectChange: <K extends keyof ProjectInput>(field: K, value: ProjectInput[K]) => void;
  onServerChange: <K extends keyof ServerInput>(field: K, value: ServerInput[K]) => void;
  onCloseInspector: () => void;
  onDeleteProject: () => void;
  onSaveProject: () => void;
  onDeleteServer: () => void;
  onSaveServer: () => void;
  onLocalSshKeyDirectoryChange: (value: string) => void;
  onLocalSshKeyFileNameChange: (value: string) => void;
  onLocalSshKeyNameChange: (value: string) => void;
  onLocalSshKeyPassphraseChange: (value: string) => void;
  onKeychainNameChange: (value: string) => void;
  onKeychainKindChange: (value: KeychainItemKind) => void;
  onKeychainSecretChange: (value: string) => void;
  onBrowseLocalSshKeyDirectory: () => void;
  onBrowseKeychainSecret: () => void;
  onCloseLocalSshKeyEditor: () => void;
  onCloseKeychainEditor: () => void;
  onDeleteKeychainItem: (id: string) => void;
  onCreateLocalSshKey: () => void;
  onSaveKeychainItem: () => void;
};

export function AppDialogs({
  inspector,
  projectDraft,
  serverDraft,
  projects,
  servers,
  gitHubRepositories,
  keychainItems,
  saving,
  editingKeychainItem,
  creatingKeychainItem,
  creatingLocalSshKey,
  keychainNameDraft,
  keychainKindDraft,
  keychainSecretDraft,
  localSshKeyDirectoryDraft,
  localSshKeyFileNameDraft,
  localSshKeyPassphraseDraft,
  onProjectChange,
  onServerChange,
  onCloseInspector,
  onDeleteProject,
  onSaveProject,
  onDeleteServer,
  onSaveServer,
  onLocalSshKeyDirectoryChange,
  onLocalSshKeyFileNameChange,
  onLocalSshKeyNameChange,
  onLocalSshKeyPassphraseChange,
  onKeychainNameChange,
  onKeychainKindChange,
  onKeychainSecretChange,
  onBrowseLocalSshKeyDirectory,
  onBrowseKeychainSecret,
  onCloseLocalSshKeyEditor,
  onCloseKeychainEditor,
  onDeleteKeychainItem,
  onCreateLocalSshKey,
  onSaveKeychainItem
}: AppDialogsProps) {
  return (
    <>
      {inspector.kind === "project" ? (
        <ProjectEditor
          draft={projectDraft}
          gitHubRepositories={gitHubRepositories}
          keychainItems={keychainItems}
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
          keychainItems={keychainItems}
          mode={inspector.mode}
          onChange={onServerChange}
          onClose={onCloseInspector}
          onDelete={inspector.mode === "edit" ? onDeleteServer : undefined}
          onSave={onSaveServer}
          projects={projects}
          saving={saving}
        />
      ) : null}

      {editingKeychainItem || creatingKeychainItem ? (
        <KeychainItemEditor
          kind={keychainKindDraft}
          mode={creatingKeychainItem ? "create" : "edit"}
          name={keychainNameDraft}
          onKindChange={onKeychainKindChange}
          onNameChange={onKeychainNameChange}
          onClose={onCloseKeychainEditor}
          onDelete={
            editingKeychainItem ? () => onDeleteKeychainItem(editingKeychainItem.id) : undefined
          }
          onBrowseSecret={onBrowseKeychainSecret}
          onSecretChange={onKeychainSecretChange}
          onSave={onSaveKeychainItem}
          saving={saving}
          secret={keychainSecretDraft}
        />
      ) : null}

      {creatingLocalSshKey ? (
        <LocalSshKeyEditor
          directory={localSshKeyDirectoryDraft}
          fileName={localSshKeyFileNameDraft}
          name={keychainNameDraft}
          onBrowseDirectory={onBrowseLocalSshKeyDirectory}
          onClose={onCloseLocalSshKeyEditor}
          onDirectoryChange={onLocalSshKeyDirectoryChange}
          onFileNameChange={onLocalSshKeyFileNameChange}
          onNameChange={onLocalSshKeyNameChange}
          onPassphraseChange={onLocalSshKeyPassphraseChange}
          onSave={onCreateLocalSshKey}
          passphrase={localSshKeyPassphraseDraft}
          saving={saving}
        />
      ) : null}
    </>
  );
}
