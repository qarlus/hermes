import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import {
  ArrowClockwise,
  CaretRight,
  FolderSimple,
  HardDrives,
  X
} from "@phosphor-icons/react";
import type {
  FileBrowserDirectoryRecord,
  ProjectRemoteConnectionInput
} from "@hermes/core";
import { readProjectRemoteDirectory } from "@hermes/db";

interface ProjectRemoteDirectoryDialogProps {
  connection: ProjectRemoteConnectionInput;
  currentPath: string;
  disabled: boolean;
  onChoose: (path: string) => void;
}

export function ProjectRemoteDirectoryDialog({
  connection,
  currentPath,
  disabled,
  onChoose
}: ProjectRemoteDirectoryDialogProps) {
  const [open, setOpen] = useState(false);
  const [directory, setDirectory] = useState<FileBrowserDirectoryRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState("");

  const handleClose = () => {
    setOpen(false);
    setDirectory(null);
    setError(null);
    setSelectedPath("");
  };

  const handleOpen = () => {
    setSelectedPath(currentPath.trim());
    setOpen(true);
  };

  const handleConfirm = () => {
    const nextPath = selectedPath.trim() || (directory?.target.path ?? currentPath);
    if (!nextPath) {
      return;
    }

    flushSync(() => {
      handleClose();
    });
    onChoose(nextPath);
  };

  useEffect(() => {
    if (!open) {
      return;
    }

    void loadDirectory(currentPath || null);
  }, [open]);

  const loadDirectory = async (path: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const next = await readProjectRemoteDirectory(connection, path);
      setDirectory(next);
      setSelectedPath(next.target.path ?? "");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
      setDirectory(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        className="path-picker-field"
        disabled={disabled}
        onClick={handleOpen}
        type="button"
      >
        <span className="path-picker-field__icon">
          <HardDrives size={16} />
        </span>
        <span className="path-picker-field__copy">
          <strong>{currentPath || "Choose a remote project folder"}</strong>
          <span>
            {disabled ? "Enter the host and SSH key first." : "Opens the remote directory picker."}
          </span>
        </span>
        <span className="path-picker-field__action">Browse</span>
      </button>

      {open ? (
        <div className="modal-backdrop" onClick={handleClose} role="presentation">
          <section
            aria-label="Browse remote directories"
            className="modal-card modal-card--workspace project-remote-browser"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-card__header">
              <div>
                <p className="eyebrow">Remote browser</p>
                <h2>{(directory?.title ?? connection.hostname) || "Server directory"}</h2>
              </div>
              <button
                aria-label="Close remote browser"
                className="ghost-button ghost-button--icon"
                onClick={handleClose}
                type="button"
              >
                <X size={16} />
              </button>
            </div>

            <div className="modal-card__body project-remote-browser__body">
              <div className="project-remote-browser__toolbar">
                <button
                  className="ghost-button"
                  disabled={!directory?.parentPath || loading}
                  onClick={() => void loadDirectory(directory?.parentPath ?? null)}
                  type="button"
                >
                  <CaretRight className="project-remote-browser__up-icon" size={14} />
                  Up
                </button>
                <button
                  className="ghost-button"
                  disabled={loading}
                  onClick={() => void loadDirectory((directory?.target.path ?? currentPath) || null)}
                  type="button"
                >
                  <ArrowClockwise size={14} />
                  Refresh
                </button>
                <span className="project-remote-browser__path">
                  {(directory?.target.path ?? currentPath) || connection.hostname}
                </span>
              </div>

              {error ? <div className="project-remote-browser__error">{error}</div> : null}

              <div className="project-remote-browser__selection">
                <div className="project-remote-browser__selection-copy">
                  <strong>Selected project folder</strong>
                  <span>{selectedPath || directory?.target.path || currentPath || "No folder selected yet."}</span>
                </div>
              </div>

              <div className="project-remote-browser__list">
                {loading ? (
                  <div className="project-remote-browser__empty">Loading remote directories...</div>
                ) : directory ? (
                  <>
                    {directory.entries.filter((entry) => entry.kind === "directory").length > 0 ? (
                      directory.entries
                        .filter((entry) => entry.kind === "directory")
                        .map((entry) => (
                          <button
                            className="project-remote-browser__row"
                            key={entry.path}
                            onClick={() => void loadDirectory(entry.path)}
                            type="button"
                          >
                            <span className="project-remote-browser__row-icon">
                              <FolderSimple size={15} />
                            </span>
                            <span className="project-remote-browser__row-copy">
                              <strong>{entry.name}</strong>
                              <span>{entry.path}</span>
                            </span>
                            <span className="project-remote-browser__row-action">
                              <CaretRight size={14} />
                            </span>
                          </button>
                        ))
                    ) : (
                      <div className="project-remote-browser__empty">
                        This directory has no child folders.
                      </div>
                    )}
                  </>
                ) : (
                  <div className="project-remote-browser__empty">
                    Connect to the server to browse its directories.
                  </div>
                )}
              </div>
            </div>

            <div className="modal-card__actions project-remote-browser__actions">
              <button className="ghost-button" onClick={handleClose} type="button">
                Cancel
              </button>
              <button
                className="primary-button"
                disabled={loading || !(selectedPath || directory?.target.path || currentPath)}
                onClick={handleConfirm}
                type="button"
              >
                Save project folder
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
