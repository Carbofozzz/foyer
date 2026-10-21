#!/usr/bin/env node
/**
 * Host entry for OpenClaw or a Foyer-run agent.
 * Tool list is only the lock hands. This process does not register a shell.
 * Cursor's built-in terminal is a different app and is not closed by this file.
 */
process.env.FOYER_LOCK_HOST = "1";
await import("./lock-broker.mjs");
