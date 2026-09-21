import React, { useEffect, useRef } from "react";
import { MessageBubble } from "./MessageBubble.jsx";
import ChatEmptyState from "./ChatEmptyState.jsx";

export function ChatThread({
  messages,
  onRetry,
  onAudioPlay,
  onSaveToCollection,
  uiStrings,
  aiPartnerDisplayName,
  baseLanguageCode,
}) {
  const threadRef = useRef(null);
  const messageContentVersion = messages
    .map(
      (message) =>
        `${message.id ?? ""}:${message.status ?? ""}:${message.originalText ?? ""}:${message.translatedText ?? ""}`,
    )
    .join("\u0001");

  useEffect(() => {
    const container = threadRef.current;

    if (!container) return;

    container.scrollTo({
      top: container.scrollHeight,
      behavior: "smooth",
    });
  }, [messageContentVersion]);

  if (messages.length === 0) {
    return <ChatEmptyState />;
  }

  return (
    <div
      ref={threadRef}
      className="h-full overflow-y-auto pr-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
    >
      <div className="flex flex-col gap-4 pb-2">
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            onRetry={onRetry}
            onAudioPlay={onAudioPlay}
            onSaveToCollection={onSaveToCollection}
            uiStrings={uiStrings}
            aiPartnerDisplayName={aiPartnerDisplayName}
            baseLanguageCode={baseLanguageCode}
          />
        ))}
      </div>
    </div>
  );
}
