import fs from "fs";
import os from "os";
import { exec, execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { closeMainWindow, showToast, Cache } from "@vicinae/api";
import { getSettings } from "./settings";

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

export type Host = {
  name: string;
  ip: string;
  aliases: string[];
};

export type Repo = {
  hostname: string;
  repoName: string;
  repoFolder: string;
};

const repoCache = new Cache();
const REPO_CACHE_KEY = "git-repos";

export async function parseHostsFile(): Promise<Host[]> {
  const { hostsFile, hostPrefix } = getSettings();
  const filePath = hostsFile || "/etc/hosts";
  const prefix = (hostPrefix || "").trim();

  try {
    const content = await fs.promises.readFile(filePath, "utf8");
    const lines = content.split("\n");
    const hosts: Host[] = [];
    const seen = new Set<string>();

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const parts = trimmed.split(/\s+/);
      const ip = parts[0];
      const hostnames: string[] = [];

      for (let i = 1; i < parts.length; i++) {
        if (parts[i].startsWith("#")) break;
        hostnames.push(parts[i]);
      }

      for (let i = 0; i < hostnames.length; i++) {
        const hostname = hostnames[i];
        if (prefix && !hostname.startsWith(prefix)) continue;
        if (seen.has(hostname)) continue;
        seen.add(hostname);

        const aliases = hostnames.filter((_, j) => j !== i);
        hosts.push({ name: hostname, ip, aliases });
      }
    }

    hosts.sort((a, b) => a.name.localeCompare(b.name));
    return hosts;
  } catch {
    return [];
  }
}

export function sshTarget(hostname: string): string {
  const { sshUser } = getSettings();
  return sshUser ? `${sshUser}@${hostname}` : hostname;
}

const TERMINAL_CMDS: [string, ...string[]][] = [
  ["foot", "-e"],
  ["kitty", "--"],
  ["alacritty", "-e"],
  ["wezterm", "start", "--"],
  ["gnome-terminal", "--"],
  ["konsole", "-e"],
  ["xterm", "-e"],
];

let detectedTerminal: [string, ...string[]] | null | undefined;

async function detectTerminal(): Promise<[string, ...string[]] | null> {
  if (detectedTerminal !== undefined) return detectedTerminal;

  const envTerminal = process.env.TERMINAL;
  if (envTerminal) {
    detectedTerminal = [envTerminal, "-e"];
    return detectedTerminal;
  }

  for (const cmd of TERMINAL_CMDS) {
    try {
      await execFileAsync("which", [cmd[0]], { timeout: 2000 });
      detectedTerminal = cmd;
      return detectedTerminal;
    } catch {}
  }
  detectedTerminal = null;
  return null;
}

function buildSshCmd(target: string): string {
  return `ssh ${target}; echo; echo 'Connection closed. Press Enter to exit.'; read`;
}

function spawnDetached(cmd: string, args: string[]): void {
  const child = spawn(cmd, args, { detached: true, stdio: "ignore" });
  child.unref();
}

async function runAndCapture(
  cmd: string,
  args: string[],
  timeout = 3000,
): Promise<{ exitCode: number; stdout: string }> {
  try {
    const { stdout } = await execFileAsync(cmd, args, { timeout });
    return { exitCode: 0, stdout: stdout.trim() };
  } catch (err: any) {
    return { exitCode: err.code ?? 1, stdout: (err.stdout || "").trim() };
  }
}

function launchNewKitty(hostname: string, sshCmd: string): void {
  showToast({ title: `Connecting to ${hostname}` });
  spawnDetached("kitty", ["--title", hostname, "sh", "-c", sshCmd]);
}

async function connectKitty(hostname: string, target: string): Promise<void> {
  const { kittySocket } = getSettings();
  const socketBase = kittySocket || "unix:@mykitty";
  const sshCmd = buildSshCmd(target);

  const pgrep = await runAndCapture("pgrep", ["-x", "kitty"]);
  if (pgrep.exitCode !== 0 || !pgrep.stdout) {
    launchNewKitty(hostname, sshCmd);
    return;
  }

  const kittyPid = pgrep.stdout.split("\n")[0].trim();
  const socket = `${socketBase}-${kittyPid}`;

  const check = await runAndCapture("kitty", ["@", "--to", socket, "ls"]);
  if (check.exitCode !== 0) {
    launchNewKitty(hostname, sshCmd);
    return;
  }

  const launch = await runAndCapture("kitty", [
    "@", "--to", socket,
    "launch", "--type=tab", "--tab-title", hostname,
    "sh", "-c", sshCmd,
  ]);

  if (launch.exitCode === 0) {
    showToast({ title: `Opening ${hostname} in kitty tab` });
    execFileAsync("kitty", ["@", "--to", socket, "focus-window"], {
      timeout: 2000,
    }).catch(() => {});
  } else {
    launchNewKitty(hostname, sshCmd);
  }
}

export async function connectSSH(hostname: string): Promise<void> {
  const { terminal } = getSettings();
  const target = sshTarget(hostname);

  if (terminal === "kitty") {
    await connectKitty(hostname, target);
    closeMainWindow();
    return;
  }

  showToast({ title: `Connecting to ${hostname}` });

  if (terminal) {
    const parts = terminal.trim().split(/\s+/);
    spawnDetached(parts[0], [...parts.slice(1), "ssh", target]);
  } else {
    const termCmd = await detectTerminal();
    if (termCmd) {
      const [bin, ...args] = termCmd;
      if (bin === "kitty") {
        await connectKitty(hostname, target);
        closeMainWindow();
        return;
      }
      spawnDetached(bin, [...args, "ssh", target]);
    } else {
      showToast({ title: "No terminal found. Set one in preferences." });
      return;
    }
  }

  closeMainWindow();
}

export function getCloneDir(): string {
  const { cloneDirectory } = getSettings();
  return cloneDirectory || os.homedir();
}

export function repoFolderName(repoName: string): string {
  return repoName.split("/").pop()!.replace(/\.git$/, "");
}

export async function repoExists(repoName: string): Promise<boolean> {
  const dir = `${getCloneDir()}/${repoFolderName(repoName)}`;
  try {
    const stat = await fs.promises.stat(dir);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

export async function fetchGitRepos(hostname: string): Promise<string[]> {
  try {
    const { stdout, stderr } = await execFileAsync(
      "ssh",
      [
        "-o", "ConnectTimeout=3",
        "-o", "BatchMode=yes",
        "-o", "StrictHostKeyChecking=accept-new",
        `git@${hostname}`,
      ],
      { timeout: 10000 },
    );
    return parseRepoOutput(stdout + "\n" + stderr);
  } catch (err: any) {
    const output = (err.stdout || "") + "\n" + (err.stderr || "");
    const repos = parseRepoOutput(output);
    if (repos.length > 0) return repos;
    return [];
  }
}

function parseRepoOutput(output: string): string[] {
  const lines = output.trim().split("\n").filter((l) => l.trim());
  const repos: string[] = [];

  for (const line of lines) {
    if (
      line.includes("Welcome") ||
      line.includes("hello") ||
      line.includes("PTY") ||
      line.includes("interactive") ||
      line.includes("Hi ") ||
      line.includes("You've successfully")
    ) {
      continue;
    }

    const match = line.match(/^[RW\s]+\t(.+)$/);
    if (match) {
      repos.push(match[1].trim());
    } else if (line.match(/^[\w\-./]+$/)) {
      repos.push(line.trim());
    }
  }
  return repos;
}

export async function cloneRepo(
  hostname: string,
  repoName: string,
): Promise<{ success: boolean; error?: string }> {
  const cloneUrl = `git@${hostname}:${repoName}`;
  const cwd = getCloneDir();

  try {
    await execAsync(`git clone ${shellEscape(cloneUrl)}`, {
      cwd,
      timeout: 120000,
    });
    return { success: true };
  } catch (err: any) {
    const stderr = err.stderr || err.message || "Unknown error";
    const lines = stderr.split("\n");
    for (const line of lines) {
      if (line.includes("fatal:") || line.includes("error:")) {
        return {
          success: false,
          error: line.replace(/^(fatal:|error:)\s*/, "").trim(),
        };
      }
    }
    return { success: false, error: lines[lines.length - 1] || stderr };
  }
}

function shellEscape(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

export function getCachedRepos(): Record<string, string[]> {
  const raw = repoCache.get(REPO_CACHE_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function setCachedRepos(repos: Record<string, string[]>): void {
  repoCache.set(REPO_CACHE_KEY, JSON.stringify(repos));
}

export function getCanonicalHosts(hosts: Host[]): Set<string> {
  const ipToHost: Record<string, string> = {};
  for (const host of hosts) {
    if (!ipToHost[host.ip]) {
      ipToHost[host.ip] = host.name;
    }
  }
  return new Set(Object.values(ipToHost));
}
