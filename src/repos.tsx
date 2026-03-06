import React, { useState, useEffect, useMemo } from "react";
import {
  Action,
  ActionPanel,
  Color,
  Icon,
  Image,
  List,
} from "@vicinae/api";
import {
  parseHostsFile,
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

export default function ReposCommand() {
  const [searchText, setSearchText] = useState("");
  const [hosts, setHosts] = useState<Host[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [reposMap, setReposMap] = useState<Record<string, string[]>>(
    getCachedRepos(),
  );
  const [fetchProgress, setFetchProgress] = useState("");
  const { existsMap, cloningSet, handleClone, batchCheckExists } = useRepoActions();

  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      const parsedHosts = await parseHostsFile();
      if (cancelled) return;
      setHosts(parsedHosts);

      const canonical = getCanonicalHosts(parsedHosts);
      const cached = getCachedRepos();

      const toFetch = [...canonical].filter(
        (h) => !cached[h] || cached[h].length === 0,
      );

      if (Object.keys(cached).length > 0) {
        setReposMap(cached);
        setIsLoading(toFetch.length > 0);
      }

      const CONCURRENCY = 8;
      let completed = 0;
      const allRepos = { ...cached };

      for (let i = 0; i < toFetch.length; i += CONCURRENCY) {
        if (cancelled) return;
        const batch = toFetch.slice(i, i + CONCURRENCY);

        setFetchProgress(
          `Scanning hosts ${completed + 1}–${Math.min(completed + batch.length, toFetch.length)} of ${toFetch.length}`,
        );

        const results = await Promise.all(
          batch.map(async (hostname) => ({
            hostname,
            repos: await fetchGitRepos(hostname),
          })),
        );

        for (const { hostname, repos } of results) {
          if (repos.length > 0) allRepos[hostname] = repos;
        }

        completed += batch.length;
        if (!cancelled) {
          setReposMap({ ...allRepos });
          setCachedRepos(allRepos);
        }
      }

      if (!cancelled) {
        setIsLoading(false);
        setFetchProgress("");

        const allRepoNames: string[] = [];
        for (const hostname in allRepos) {
          for (const repo of allRepos[hostname]) {
            allRepoNames.push(repo);
          }
        }
        await batchCheckExists(allRepoNames);
      }
    }

    loadAll();
    return () => {
      cancelled = true;
    };
  }, []);

  const reposByHost = useMemo(() => {
    const canonical =
      hosts.length > 0 ? getCanonicalHosts(hosts) : new Set<string>();
    const seen = new Set<string>();
    const groups: { hostname: string; repos: Repo[] }[] = [];

    for (const hostname in reposMap) {
      if (canonical.size > 0 && !canonical.has(hostname)) continue;
      const repos: Repo[] = [];
      for (const repoName of reposMap[hostname]) {
        if (seen.has(repoName)) continue;
        seen.add(repoName);
        repos.push({
          hostname,
          repoName,
          repoFolder: repoFolderName(repoName),
        });
      }
      if (repos.length > 0) {
        groups.push({ hostname, repos });
      }
    }
    groups.sort((a, b) => a.hostname.localeCompare(b.hostname));
    return groups;
  }, [reposMap, hosts]);

  const allRepos = useMemo(
    () => reposByHost.flatMap((g) => g.repos),
    [reposByHost],
  );

  const isSearching = searchText.trim().length > 0;

  const filteredRepos = useMemo(() => {
    if (!isSearching) return [];
    const q = searchText.toLowerCase();
    return allRepos.filter((r) => r.repoName.toLowerCase().includes(q));
  }, [allRepos, searchText, isSearching]);

  const totalRepos = allRepos.length;
  const hostsWithRepos = reposByHost.length;

  function repoItem(repo: Repo) {
    const exists = existsMap[repo.repoFolder] || false;
    const cloning = cloningSet.has(repo.repoFolder);

    return (
      <List.Item
        key={`${repo.hostname}-${repo.repoName}`}
        title={repo.repoName}
        icon={repoIcon(exists, cloning)}
        accessories={[
          ...(isSearching
            ? [
                {
                  tag: { value: repo.hostname, color: Color.Blue },
                  icon: {
                    source: Icon.Network,
                    tintColor: Color.Blue,
                  } as Image.ImageLike,
                },
              ]
            : []),
          ...repoAccessories(exists, cloning),
        ]}
        actions={
          <ActionPanel>
            {!exists && !cloning && (
              <Action
                title="Clone Repository"
                icon={Icon.Download}
                onAction={() =>
                  handleClone(repo.hostname, repo.repoName)
                }
              />
            )}
            <Action.CopyToClipboard
              title="Copy Clone URL"
              content={`git@${repo.hostname}:${repo.repoName}`}
              shortcut={{ modifiers: ["cmd"], key: "c" }}
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
  }

  return (
    <List
      isLoading={isLoading}
      searchText={searchText}
      onSearchTextChange={setSearchText}
      searchBarPlaceholder={`Search ${totalRepos} repos across ${hostsWithRepos} hosts...`}
    >
      {isLoading && fetchProgress && (
        <List.EmptyView
          title={fetchProgress}
          description="Scanning SSH hosts for git repositories..."
          icon={{ source: Icon.Network, tintColor: Color.Blue }}
        />
      )}

      {isSearching ? (
        <List.Section
          title="Search Results"
          subtitle={`${filteredRepos.length} matching`}
        >
          {filteredRepos.map(repoItem)}
        </List.Section>
      ) : (
        reposByHost.map((group) => (
          <List.Section
            key={group.hostname}
            title={group.hostname}
            subtitle={`${group.repos.length} repos`}
          >
            {group.repos.map(repoItem)}
          </List.Section>
        ))
      )}
    </List>
  );
}
