# Hosts SSH

A [vicinae](https://github.com/vicinaehq/vicinae) extension for quick SSH connections and git repo management from `/etc/hosts`.

## Features

- **SSH Host Browsing** — Parses `/etc/hosts` and lists matching hosts with IP addresses and aliases
- **One-Key SSH Connect** — Opens SSH sessions in your terminal with Enter
- **Kitty Tab Support** — Automatically opens connections as new kitty tabs via remote control when kitty is detected or configured
- **Per-Host Git Repos** — Browse and clone git repositories on each host (Ctrl+Enter)
- **Global Repo Search** — Type `!` in the search bar to search repos across all hosts
- **Terminal Auto-Detection** — Finds your terminal automatically (foot, kitty, alacritty, wezterm, gnome-terminal, konsole, xterm) or use a custom command
- **In-Extension Settings** — Configure everything from within the extension (Cmd+,)

## Installation

Clone into your vicinae extensions directory and build:

```sh
git clone https://github.com/hansibansix/vicinae-hosts-ssh.git ~/.local/share/vicinae/extensions/hosts-ssh
cd ~/.local/share/vicinae/extensions/hosts-ssh
npm install && npm run build
```

## Commands

| Command | Description |
|---------|-------------|
| **SSH Hosts** | Browse hosts and connect via SSH |
| **Git Repos** | Search git repositories across all hosts |

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Enter | Connect SSH |
| Ctrl+Enter | View git repos for selected host |
| Cmd+C | Copy hostname |
| Cmd+Shift+C | Copy IP address |
| Cmd+R | Refresh repos |
| Cmd+, | Extension settings |

## Settings

| Setting | Description | Default |
|---------|-------------|---------|
| Terminal | Terminal command for SSH (`kitty` for tab support, or e.g. `foot -e`) | Auto-detect |
| Kitty Socket | Socket path for kitty remote control | `unix:@mykitty` |
| SSH User | Default SSH username | System default |
| Hosts File | Path to hosts file | `/etc/hosts` |
| Host Prefix | Only show hosts with this prefix | All hosts |
| Clone Directory | Directory for cloned repos | Home directory |

## Git Repo Discovery

The extension discovers repos by connecting as `git@hostname` via SSH. This works with Gitolite, Gitea, and similar servers that list repos on SSH login. Repos can be cloned directly from the extension.

## License

MIT
