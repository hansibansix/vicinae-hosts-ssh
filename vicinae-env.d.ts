/// <reference types="@vicinae/api">

/*
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 */

type ExtensionPreferences = {
  /** Terminal - Terminal command for SSH. Empty uses the default. Examples: 'kitty -1 kitten', 'foot -e' */
	"terminal": string;

	/** SSH User - Default SSH username. Leave empty to use system default */
	"sshUser": string;

	/** Hosts File - Path to the hosts file */
	"hostsFile": string;

	/** Host Prefix - Only show hosts starting with this prefix. Leave empty for all hosts */
	"hostPrefix": string;

	/** Clone Directory - Directory to clone repositories into. Empty uses home directory */
	"cloneDirectory": string;
}

declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Command: SSH Hosts */
	export type Hosts = ExtensionPreferences & {
		
	}

	/** Command: Git Repos */
	export type Repos = ExtensionPreferences & {
		
	}
}

declare namespace Arguments {
  /** Command: SSH Hosts */
	export type Hosts = {
		
	}

	/** Command: Git Repos */
	export type Repos = {
		
	}
}