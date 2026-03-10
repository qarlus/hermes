import { useEffect } from "react";
import type { ViewState } from "./app";

type UseAppShortcutsOptions = {
  view: ViewState;
  selectedProjectId: string | null;
  selectedServerId: string | null;
  onCreateProject: () => void;
  onCreateServer: () => void;
  onConnectServer: (serverId: string) => void;
  onDismiss: () => void;
};

export function useAppShortcuts({
  view,
  selectedProjectId,
  selectedServerId,
  onCreateProject,
  onCreateServer,
  onConnectServer,
  onDismiss
}: UseAppShortcutsOptions) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "n") {
        event.preventDefault();
        if (view === "workspace" && selectedProjectId) {
          onCreateServer();
        } else if (view === "dashboard") {
          onCreateProject();
        }
      }

      if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && selectedServerId) {
        event.preventDefault();
        onConnectServer(selectedServerId);
      }

      if (event.key === "Escape") {
        onDismiss();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    onConnectServer,
    onCreateProject,
    onCreateServer,
    onDismiss,
    selectedProjectId,
    selectedServerId,
    view
  ]);
}
