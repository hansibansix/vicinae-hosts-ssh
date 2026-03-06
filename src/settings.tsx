import React from "react";
import {
  Action,
  ActionPanel,
  Form,
  Icon,
  showToast,
  Toast,
  getPreferenceValues,
  Cache,
} from "@vicinae/api";

const settingsCache = new Cache();
const SETTINGS_KEY = "user-settings";

export type Settings = {
  terminal: string;
  kittySocket: string;
  sshUser: string;
  hostsFile: string;
  hostPrefix: string;
  cloneDirectory: string;
};

const DEFAULTS: Settings = {
  terminal: "",
  kittySocket: "unix:@mykitty",
  sshUser: "",
  hostsFile: "/etc/hosts",
  hostPrefix: "",
  cloneDirectory: "",
};

export function getSettings(): Settings {
  const raw = settingsCache.get(SETTINGS_KEY);
  if (raw) {
    try {
      return { ...DEFAULTS, ...JSON.parse(raw) };
    } catch {}
  }
  const prefs = getPreferenceValues<Preferences>();
  return {
    terminal: prefs.terminal || DEFAULTS.terminal,
    kittySocket: (prefs as any).kittySocket || DEFAULTS.kittySocket,
    sshUser: prefs.sshUser || DEFAULTS.sshUser,
    hostsFile: prefs.hostsFile || DEFAULTS.hostsFile,
    hostPrefix: prefs.hostPrefix || DEFAULTS.hostPrefix,
    cloneDirectory: prefs.cloneDirectory || DEFAULTS.cloneDirectory,
  };
}

function saveSettings(settings: Settings): void {
  settingsCache.set(SETTINGS_KEY, JSON.stringify(settings));
}

export function SettingsForm() {
  const current = getSettings();

  return (
    <Form
      navigationTitle="Extension Settings"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Save Settings"
            icon={Icon.CheckCircle}
            onSubmit={(values: Form.Values) => {
              saveSettings({
                terminal: String(values.terminal ?? ""),
                kittySocket: String(values.kittySocket ?? ""),
                sshUser: String(values.sshUser ?? ""),
                hostsFile: String(values.hostsFile ?? ""),
                hostPrefix: String(values.hostPrefix ?? ""),
                cloneDirectory: String(values.cloneDirectory ?? ""),
              });
              showToast({
                style: Toast.Style.Success,
                title: "Settings saved",
                message: "Restart the command to apply changes",
              });
            }}
          />
        </ActionPanel>
      }
    >
      <Form.Description
        title="Terminal"
        text="Configure how SSH connections are opened"
      />
      <Form.TextField
        id="terminal"
        title="Terminal"
        info='Set to "kitty" for kitty tab support, or a custom command like "foot -e" (empty = auto-detect)'
        defaultValue={current.terminal}
      />
      <Form.TextField
        id="kittySocket"
        title="Kitty Socket"
        info="Socket path for kitty remote control (from listen_on in kitty.conf)"
        defaultValue={current.kittySocket}
      />
      <Form.TextField
        id="sshUser"
        title="SSH User"
        info="Leave empty for system default"
        defaultValue={current.sshUser}
      />
      <Form.Separator />
      <Form.Description
        title="Hosts"
        text="Configure which hosts to show"
      />
      <Form.TextField
        id="hostsFile"
        title="Hosts File"
        defaultValue={current.hostsFile}
      />
      <Form.TextField
        id="hostPrefix"
        title="Host Prefix"
        info="Only show hosts with this prefix (empty = all)"
        defaultValue={current.hostPrefix}
      />
      <Form.Separator />
      <Form.Description
        title="Git"
        text="Configure git repository cloning"
      />
      <Form.TextField
        id="cloneDirectory"
        title="Clone Directory"
        info="Directory for cloned repos (empty = home)"
        defaultValue={current.cloneDirectory}
      />
    </Form>
  );
}
