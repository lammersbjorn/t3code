import { DEFAULT_MODEL_BY_PROVIDER, DEFAULT_PROVIDER_INTERACTION_MODE } from "@t3tools/contracts";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { isElectron } from "../env";
import { Button } from "../components/ui/button";
import { SidebarTrigger } from "../components/ui/sidebar";
import { readNativeApi } from "../nativeApi";
import { useStore } from "../store";
import { newCommandId, newProjectId, newThreadId } from "../lib/utils";

function ChatIndexRouteView() {
  const navigate = useNavigate();
  const projects = useStore((store) => store.projects);
  const threadsHydrated = useStore((store) => store.threadsHydrated);
  const [isPickingFolder, setIsPickingFolder] = useState(false);
  const [pickFolderError, setPickFolderError] = useState<string | null>(null);
  const promptedForInitialFolderRef = useRef(false);

  const createOrFocusProject = useCallback(
    async (rawCwd: string) => {
      const cwd = rawCwd.trim();
      const api = readNativeApi();
      if (!api || cwd.length === 0) {
        return;
      }

      const store = useStore.getState();
      const existingProject = store.projects.find((project) => project.cwd === cwd);

      if (existingProject) {
        const latestThread = store.threads
          .filter((thread) => thread.projectId === existingProject.id)
          .toSorted((a, b) => {
            const byDate = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            if (byDate !== 0) return byDate;
            return b.id.localeCompare(a.id);
          })[0];

        if (latestThread) {
          await navigate({
            to: "/$threadId",
            params: { threadId: latestThread.id },
          });
          return;
        }

        const threadId = newThreadId();
        const createdAt = new Date().toISOString();
        await api.orchestration.dispatchCommand({
          type: "thread.create",
          commandId: newCommandId(),
          threadId,
          projectId: existingProject.id,
          title: "New thread",
          model: existingProject.model ?? DEFAULT_MODEL_BY_PROVIDER.codex,
          runtimeMode: "full-access",
          interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
          branch: null,
          worktreePath: null,
          createdAt,
        });
        const snapshot = await api.orchestration.getSnapshot();
        useStore.getState().syncServerReadModel(snapshot);
        await navigate({
          to: "/$threadId",
          params: { threadId },
        });
        return;
      }

      const projectId = newProjectId();
      const threadId = newThreadId();
      const createdAt = new Date().toISOString();
      const title = cwd.split(/[/\\]/).findLast((segment) => segment.length > 0) ?? cwd;

      await api.orchestration.dispatchCommand({
        type: "project.create",
        commandId: newCommandId(),
        projectId,
        title,
        workspaceRoot: cwd,
        defaultModel: DEFAULT_MODEL_BY_PROVIDER.codex,
        createdAt,
      });
      await api.orchestration.dispatchCommand({
        type: "thread.create",
        commandId: newCommandId(),
        threadId,
        projectId,
        title: "New thread",
        model: DEFAULT_MODEL_BY_PROVIDER.codex,
        runtimeMode: "full-access",
        interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
        branch: null,
        worktreePath: null,
        createdAt,
      });
      const snapshot = await api.orchestration.getSnapshot();
      useStore.getState().syncServerReadModel(snapshot);
      await navigate({
        to: "/$threadId",
        params: { threadId },
      });
    },
    [navigate],
  );

  const requestProjectFolder = useCallback(async () => {
    if (isPickingFolder) {
      return;
    }

    const api = readNativeApi();
    if (!api) {
      setPickFolderError("Desktop APIs are unavailable.");
      return;
    }

    setIsPickingFolder(true);
    setPickFolderError(null);
    try {
      const pickedPath = await api.dialogs.pickFolder();
      if (!pickedPath) {
        return;
      }
      await createOrFocusProject(pickedPath);
    } catch (error) {
      setPickFolderError(
        error instanceof Error ? error.message : "Unable to open the folder picker.",
      );
    } finally {
      setIsPickingFolder(false);
    }
  }, [createOrFocusProject, isPickingFolder]);

  useEffect(() => {
    if (
      !isElectron ||
      !threadsHydrated ||
      projects.length > 0 ||
      promptedForInitialFolderRef.current
    ) {
      return;
    }
    promptedForInitialFolderRef.current = true;
    void requestProjectFolder();
  }, [projects.length, requestProjectFolder, threadsHydrated]);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background text-muted-foreground/40">
      {!isElectron && (
        <header className="border-b border-border px-3 py-2 md:hidden">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="size-7 shrink-0" />
            <span className="text-sm font-medium text-foreground">Threads</span>
          </div>
        </header>
      )}

      {isElectron && (
        <div className="drag-region flex h-[52px] shrink-0 items-center border-b border-border px-5">
          <span className="text-xs text-muted-foreground/50">No active thread</span>
        </div>
      )}

      <div className="flex flex-1 items-center justify-center">
        {isElectron && threadsHydrated && projects.length === 0 ? (
          <div className="mx-6 w-full max-w-md rounded-xl border border-border bg-card p-6 text-left text-foreground">
            <h1 className="text-lg font-semibold tracking-tight">Choose a project folder</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              T3 Code needs access to a workspace before it starts a chat. Pick your project
              folder first so macOS can grant access cleanly.
            </p>
            <div className="mt-5 flex items-center gap-3">
              <Button
                size="sm"
                onClick={() => void requestProjectFolder()}
                disabled={isPickingFolder}
              >
                {isPickingFolder ? "Opening picker..." : "Choose folder"}
              </Button>
              <span className="text-xs text-muted-foreground">
                You can also add one later from the sidebar.
              </span>
            </div>
            {pickFolderError ? (
              <p className="mt-3 text-sm text-destructive">{pickFolderError}</p>
            ) : null}
          </div>
        ) : (
          <div className="text-center">
            <p className="text-sm">Select a thread or create a new one to get started.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_chat/")({
  component: ChatIndexRouteView,
});
