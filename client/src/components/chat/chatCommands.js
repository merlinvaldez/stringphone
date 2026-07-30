export const AI_PARTNER_COMMAND_VALUE = "/aipartner";
export const SELECT_COMMAND_NOTICE = "Select a command.";

export function getChatCommandOptions({
  normalizedComposerText,
  aiPartnerEnabled,
}) {
  if (!normalizedComposerText.startsWith("/")) {
    return [];
  }

  const normalizedValue = normalizedComposerText.toLowerCase();
  const commands = [
    {
      value: AI_PARTNER_COMMAND_VALUE,
      label: aiPartnerEnabled ? "Turn Off" : "Turn On",
      description: aiPartnerEnabled
        ? "Disable the AI local-speaker partner for this chat."
        : "Enable an AI local-speaker partner for this chat.",
    },
  ];

  return commands.filter(
    (command) =>
      normalizedComposerText === "/" ||
      command.value.startsWith(normalizedValue),
  );
}

export function resolveChatSlashSubmission({
  normalizedComposerText,
  commandOptions,
  activeIndex,
}) {
  if (normalizedComposerText === "/") {
    return {
      type: "notice",
      notice: SELECT_COMMAND_NOTICE,
    };
  }

  return {
    type: "execute",
    command: commandOptions[activeIndex]?.value ?? normalizedComposerText,
  };
}
