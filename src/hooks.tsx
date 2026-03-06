import { useState, useCallback, useRef } from "react";
import { Color, Icon, List, showToast, Toast } from "@vicinae/api";
import { cloneRepo, repoExists, repoFolderName } from "./utils";

export function repoIcon(
  exists: boolean,
  cloning: boolean,
): { source: Icon; tintColor: Color } {
  if (exists) return { source: Icon.CheckCircle, tintColor: Color.Green };
  if (cloning) return { source: Icon.CircleProgress, tintColor: Color.Blue };
  return { source: Icon.CodeBlock, tintColor: Color.SecondaryText };
}

export function repoAccessories(
  exists: boolean,
  cloning: boolean,
): List.Item.Accessory[] {
  if (exists) return [{ tag: { value: "cloned", color: Color.Green } }];
  if (cloning) return [{ tag: { value: "cloning...", color: Color.Blue } }];
  return [];
}

export function useRepoActions() {
  const [existsMap, setExistsMap] = useState<Record<string, boolean>>({});
  const [cloningSet, setCloningSet] = useState<Set<string>>(new Set());
  const existsRef = useRef(existsMap);
  existsRef.current = existsMap;
  const cloningRef = useRef(cloningSet);
  cloningRef.current = cloningSet;

  const handleClone = useCallback(
    async (hostname: string, repoName: string) => {
      const folder = repoFolderName(repoName);
      if (existsRef.current[folder]) {
        showToast({ title: `${folder} already exists` });
        return;
      }
      if (cloningRef.current.has(folder)) {
        showToast({ title: `Already cloning ${folder}` });
        return;
      }

      setCloningSet((prev) => new Set([...prev, folder]));
      showToast({ title: `Cloning ${repoName}...` });

      const result = await cloneRepo(hostname, repoName);

      if (result.success) {
        showToast({ style: Toast.Style.Success, title: `Cloned ${repoName}` });
        setExistsMap((prev) => ({ ...prev, [folder]: true }));
      } else {
        showToast({
          style: Toast.Style.Failure,
          title: `Clone failed: ${repoName}`,
          message: result.error,
        });
      }

      setCloningSet((prev) => {
        const next = new Set(prev);
        next.delete(folder);
        return next;
      });
    },
    [],
  );

  const batchCheckExists = useCallback(
    async (repos: string[]) => {
      const entries = repos.map((r) => ({ key: repoFolderName(r), repo: r }));
      for (let i = 0; i < entries.length; i += 20) {
        const batch = entries.slice(i, i + 20);
        const checks = await Promise.all(
          batch.map(async (e) => ({
            key: e.key,
            exists: await repoExists(e.repo),
          })),
        );
        setExistsMap((prev) => {
          const updated = { ...prev };
          for (const c of checks) updated[c.key] = c.exists;
          return updated;
        });
      }
    },
    [],
  );

  return { existsMap, cloningSet, handleClone, batchCheckExists };
}
