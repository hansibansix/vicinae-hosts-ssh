import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Action,
  ActionPanel,
  Color,
  Icon,
  Image,
  List,
  showToast,
  Toast,
} from "@vicinae/api";
import {
  parseHostsFile,
  sshTarget,
  connectSSH,
  fetchGitRepos,
  repoFolderName,
  getCachedRepos,
  setCachedRepos,
  getCanonicalHosts,
  type Host,
  type Repo,
} from "./utils";
import { SettingsForm } from "./settings";
import { repoIcon, repoAccessories, useRepoActions } from "./hooks";

type ViewState =
  | { mode: "hosts" }
  | { mode: "repos"; host: Host; initialRepos: string[] };

export default function HostsCommand() {
  const [searchText, setSearchText] = useState("");
  const [hosts, setHosts] = useState<Host[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [reposMap, setReposMap] = useState<Record<string, string[]>>(
    getCachedRepos(),
  );
  const [fetchingAllRepos, setFetchingAllRepos] = useState(false);
  const fetchedAllRef = useRef(false);

  const [view, setView] = useState<ViewState>({ mode: "hosts" });
  const savedSearchRef = useRef("");

  // Repo state for global repo search (hosts mode with "!" prefix)
  const globalRepo = useRepoActions();
  // Repo state for per-host repo view
  const hostRepo = useRepoActions();

  const [hostRepos, setHostRepos] = useState<string[]>([]);
  const [hostReposLoading, setHostReposLoading] = useState(false);

  useEffect(() => {
    parseHostsFile().then((result) => {
      setHosts(result);
      setIsLoading(false);
    });
  }, []);

  // Load repos when entering per-host repo view
  useEffect(() => {
    if (view.mode !== "repos") return;

    const { host, initialRepos } = view;
    let repoList = initialRepos;
    setHostRepos(repoList);

    if (repoList.length > 0) {
      setHostReposLoading(false);
      hostRepo.batchCheckExists(repoList);
      return;
    }

    setHostReposLoading(true);

    (async () => {
      showToast({ title: `Fetching repos from ${host.name}...` });
      repoList = await fetchGitRepos(host.name);

      if (repoList.length > 0) {
        setHostRepos(repoList);
        const cached = getCachedRepos();
        cached[host.name] = repoList;
        setCachedRepos(cached);
        showToast({
          style: Toast.Style.Success,
          title: `Found ${repoList.length} repos`,
        });
      } else {
        showToast({
          style: Toast.Style.Failure,
          title: `No repos found on ${host.name}`,
        });
      }

      setHostReposLoading(false);
      if (repoList.length > 0) {
        await hostRepo.batchCheckExists(repoList);
      }
    })();
  }, [view.mode === "repos" ? (view as any).host.name : null]);

  const openRepoView = useCallback(
    (host: Host) => {
      savedSearchRef.current = searchText;
      setSearchText("");
      setView({ mode: "repos", host, initialRepos: reposMap[host.name] || [] });
    },
    [searchText, reposMap],
  );

  const goBack = useCallback(() => {
    setView({ mode: "hosts" });
    setSearchText(savedSearchRef.current);
    setHostRepos([]);
  }, []);

  const handleRefresh = useCallback(async () => {
    if (view.mode !== "repos") return;
    const { host } = view;
    setHostReposLoading(true);
    showToast({ title: `Refreshing repos from ${host.name}...` });
    const fresh = await fetchGitRepos(host.name);
    setHostRepos(fresh);
    if (fresh.length > 0) {
      const cached = getCachedRepos();
      cached[host.name] = fresh;
      setCachedRepos(cached);
    }
    setHostReposLoading(false);
    await hostRepo.batchCheckExists(fresh);
  }, [view, hostRepo.batchCheckExists]);

  // Global repo search
  const isRepoSearch = view.mode === "hosts" && searchText.startsWith("!");
  const repoQuery = isRepoSearch ? searchText.slice(1).toLowerCase() : "";

  useEffect(() => {
    if (!isRepoSearch || hosts.length === 0 || fetchedAllRef.current) return;
    fetchedAllRef.current = true;

    async function fetchAll() {
      const canonical = getCanonicalHosts(hosts);
      const cached = getCachedRepos();
      const toFetch = [...canonical].filter(
        (h) => !cached[h] || cached[h].length === 0,
      );

      if (toFetch.length === 0) {
        setReposMap({ ...cached });
        return;
      }

      setFetchingAllRepos(true);
      const allRepos = { ...cached };
      const CONCURRENCY = 8;

      for (let i = 0; i < toFetch.length; i += CONCURRENCY) {
        const batch = toFetch.slice(i, i + CONCURRENCY);
        const results = await Promise.all(
          batch.map(async (hostname) => ({
            hostname,
            repos: await fetchGitRepos(hostname),
          })),
        );
        for (const { hostname, repos } of results) {
          if (repos.length > 0) allRepos[hostname] = repos;
        }
        setReposMap({ ...allRepos });
        setCachedRepos(allRepos);
      }

      setFetchingAllRepos(false);

      const allRepoNames: string[] = [];
      for (const hostname in allRepos) {
        for (const repo of allRepos[hostname]) {
          allRepoNames.push(repo);
        }
      }
      await globalRepo.batchCheckExists(allRepoNames);
    }

    fetchAll();
  }, [isRepoSearch, hosts]);

  const filteredHosts = useMemo(() => {
    if (view.mode !== "hosts" || isRepoSearch) return [];
    if (!searchText.trim()) return hosts;
    const q = searchText.toLowerCase();
    return hosts.filter(
      (h) =>
        h.name.toLowerCase().includes(q) ||
        h.ip.toLowerCase().includes(q) ||
        h.aliases.some((a) => a.toLowerCase().includes(q)),
    );
  }, [hosts, searchText, isRepoSearch, view.mode]);

  const filteredGlobalRepos: Repo[] = useMemo(() => {
    if (!isRepoSearch) return [];
    const canonical =
      hosts.length > 0 ? getCanonicalHosts(hosts) : new Set<string>();
    const seen = new Set<string>();
    const results: Repo[] = [];

    for (const hostname in reposMap) {
      if (canonical.size > 0 && !canonical.has(hostname)) continue;
      for (const repoName of reposMap[hostname]) {
        if (seen.has(repoName)) continue;
        if (repoQuery && !repoName.toLowerCase().includes(repoQuery)) continue;
        seen.add(repoName);
        results.push({
          hostname,
          repoName,
          repoFolder: repoFolderName(repoName),
        });
      }
    }
    return results;
  }, [isRepoSearch, repoQuery, reposMap, hosts]);

  const filteredHostRepos = useMemo(() => {
    if (view.mode !== "repos" || !searchText.trim()) return hostRepos;
    const q = searchText.toLowerCase();
    return hostRepos.filter((r) => r.toLowerCase().includes(q));
  }, [hostRepos, searchText, view.mode]);

  const totalRepos = useMemo(() => {
    let count = 0;
    for (const h in reposMap) count += reposMap[h].length;
    return count;
  }, [reposMap]);

  // Per-host repo view
  if (view.mode === "repos") {
    const { host } = view;

    return (
      <List
        navigationTitle={`${host.name} — Git Repos`}
        isLoading={hostReposLoading}
        searchText={searchText}
        onSearchTextChange={setSearchText}
        searchBarPlaceholder={`Search ${hostRepos.length} repos on ${host.name}...`}
      >
        {!hostReposLoading && hostRepos.length === 0 && (
          <List.EmptyView
            title="No Repositories Found"
            description={`No git repos found on ${host.name}`}
            icon={{ source: Icon.XMarkCircle, tintColor: Color.SecondaryText }}
          />
        )}
        {filteredHostRepos.map((repo) => {
          const folder = repoFolderName(repo);
          const exists = hostRepo.existsMap[folder] || false;
          const cloning = hostRepo.cloningSet.has(folder);

          return (
            <List.Item
              key={repo}
              id={repo}
              title={repo}
              icon={repoIcon(exists, cloning)}
              accessories={repoAccessories(exists, cloning)}
              actions={
                <ActionPanel>
                  {!exists && !cloning && (
                    <Action
                      title="Clone Repository"
                      icon={Icon.Download}
                      onAction={() => hostRepo.handleClone(host.name, repo)}
                    />
                  )}
                  <Action
                    title="Back to Hosts"
                    icon={Icon.ArrowLeft}
                    onAction={goBack}
                    shortcut={{ modifiers: ["cmd"], key: "arrowLeft" }}
                  />
                  <Action.CopyToClipboard
                    title="Copy Clone URL"
                    content={`git@${host.name}:${repo}`}
                  />
                  <Action
                    title="Connect SSH"
                    icon={Icon.Terminal}
                    onAction={() => connectSSH(host.name)}
                  />
                  <Action
                    title="Refresh Repos"
                    icon={Icon.ArrowClockwise}
                    onAction={handleRefresh}
                    shortcut={{ modifiers: ["cmd"], key: "r" }}
                  />
                  <Action.Push
                    title="Extension Settings"
                    icon={Icon.Gear}
                    target={<SettingsForm />}
                    shortcut={{ modifiers: ["cmd"], key: "," }}
                  />
                </ActionPanel>
              }
            />
          );
        })}
      </List>
    );
  }

  // Hosts view (with global repo search)
  return (
    <List
      isLoading={isLoading || fetchingAllRepos}
      searchText={searchText}
      onSearchTextChange={setSearchText}
      searchBarPlaceholder='Search hosts... (prefix "!" for global repo search)'
    >
      {isRepoSearch ? (
        <>
          {filteredGlobalRepos.length === 0 && !fetchingAllRepos && (
            <List.EmptyView
              title={repoQuery ? "No Matching Repos" : "Global Repo Search"}
              description={
                repoQuery
                  ? `No repos matching "${repoQuery}"`
                  : `Type after "!" to search ${totalRepos} repos across all hosts`
              }
              icon={{ source: Icon.MagnifyingGlass, tintColor: Color.Purple }}
            />
          )}
          {filteredGlobalRepos.map((repo) => {
            const exists = globalRepo.existsMap[repo.repoFolder] || false;
            const cloning = globalRepo.cloningSet.has(repo.repoFolder);

            return (
              <List.Item
                key={`${repo.hostname}-${repo.repoName}`}
                id={`${repo.hostname}-${repo.repoName}`}
                title={repo.repoName}
                subtitle={repo.hostname}
                icon={repoIcon(exists, cloning)}
                accessories={[
                  { tag: { value: repo.hostname, color: Color.Blue } },
                  ...repoAccessories(exists, cloning),
                ]}
                actions={
                  <ActionPanel>
                    {!exists && !cloning && (
                      <Action
                        title="Clone Repository"
                        icon={Icon.Download}
                        onAction={() =>
                          globalRepo.handleClone(repo.hostname, repo.repoName)
                        }
                      />
                    )}
                    <Action.CopyToClipboard
                      title="Copy Clone URL"
                      content={`git@${repo.hostname}:${repo.repoName}`}
                    />
                    <Action
                      title={`Connect to ${repo.hostname}`}
                      icon={Icon.Terminal}
                      onAction={() => connectSSH(repo.hostname)}
                    />
                    <Action.Push
                      title="Extension Settings"
                      icon={Icon.Gear}
                      target={<SettingsForm />}
                      shortcut={{ modifiers: ["cmd"], key: "," }}
                    />
                  </ActionPanel>
                }
              />
            );
          })}
        </>
      ) : (
        filteredHosts.map((host) => {
          const hostRepos = reposMap[host.name] || [];
          const aliasText =
            host.aliases.length > 0 ? host.aliases.join(", ") : undefined;

          return (
            <List.Item
              key={host.name}
              id={host.name}
              title={host.name}
              subtitle={host.ip}
              keywords={host.aliases}
              icon={{
                source: Icon.Network,
                tintColor: Color.Blue,
              }}
              accessories={[
                ...(aliasText
                  ? [
                      {
                        text: {
                          value: aliasText,
                          color: Color.SecondaryText,
                        },
                        tooltip: "Aliases",
                      },
                    ]
                  : []),
                ...(hostRepos.length > 0
                  ? [
                      {
                        tag: {
                          value: `${hostRepos.length} repos`,
                          color: Color.Purple,
                        },
                        icon: {
                          source: Icon.CodeBlock,
                          tintColor: Color.Purple,
                        } as Image.ImageLike,
                      },
                    ]
                  : []),
              ]}
              actions={
                <ActionPanel>
                  <Action
                    title="Connect SSH"
                    icon={Icon.Terminal}
                    onAction={() => connectSSH(host.name)}
                  />
                  <Action
                    title={
                      hostRepos.length > 0
                        ? `View Git Repos (${hostRepos.length})`
                        : "Fetch Git Repos"
                    }
                    icon={Icon.CodeBlock}
                    onAction={() => openRepoView(host)}
                    shortcut={{ modifiers: ["ctrl"], key: "return" }}
                  />
                  <Action.CopyToClipboard
                    title="Copy Hostname"
                    content={host.name}
                    shortcut={{ modifiers: ["cmd"], key: "c" }}
                  />
                  <Action.CopyToClipboard
                    title="Copy IP Address"
                    content={host.ip}
                    shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
                  />
                  <Action.CopyToClipboard
                    title="Copy SSH Command"
                    content={`ssh ${sshTarget(host.name)}`}
                  />
                  <Action.Push
                    title="Extension Settings"
                    icon={Icon.Gear}
                    target={<SettingsForm />}
                    shortcut={{ modifiers: ["cmd"], key: "," }}
                  />
                </ActionPanel>
              }
            />
          );
        })
      )}
    </List>
  );
}
