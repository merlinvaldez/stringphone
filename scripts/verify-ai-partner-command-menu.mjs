import assert from "node:assert/strict";
import {
  AI_PARTNER_COMMAND_VALUE,
  SELECT_COMMAND_NOTICE,
  getChatCommandOptions,
  resolveChatSlashSubmission,
} from "../client/src/components/chat/chatCommands.js";

const initialCommands = getChatCommandOptions({
  normalizedComposerText: "/",
  aiPartnerEnabled: false,
});

assert.equal(initialCommands.length, 1);
assert.equal(initialCommands[0].value, AI_PARTNER_COMMAND_VALUE);
assert.equal(initialCommands[0].label, "Turn On");

const bareSlashSubmission = resolveChatSlashSubmission({
  normalizedComposerText: "/",
  commandOptions: initialCommands,
  activeIndex: 0,
});

assert.deepEqual(bareSlashSubmission, {
  type: "notice",
  notice: SELECT_COMMAND_NOTICE,
});

const enabledCommands = getChatCommandOptions({
  normalizedComposerText: "/aip",
  aiPartnerEnabled: true,
});

assert.equal(enabledCommands.length, 1);
assert.equal(enabledCommands[0].label, "Turn Off");

const knownCommandSubmission = resolveChatSlashSubmission({
  normalizedComposerText: "/aip",
  commandOptions: enabledCommands,
  activeIndex: 0,
});

assert.deepEqual(knownCommandSubmission, {
  type: "execute",
  command: AI_PARTNER_COMMAND_VALUE,
});

const unknownCommandSubmission = resolveChatSlashSubmission({
  normalizedComposerText: "/aix",
  commandOptions: [],
  activeIndex: 0,
});

assert.deepEqual(unknownCommandSubmission, {
  type: "execute",
  command: "/aix",
});

console.log("AI partner slash-command verification passed.");
