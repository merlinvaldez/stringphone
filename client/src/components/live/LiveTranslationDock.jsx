import React, { useEffect, useRef } from "react";
import { Maximize2, Minimize2, Radio } from "lucide-react";
import { AudioWave } from "../../StringPhoneApp.jsx";

function LanguageLine({ label, text, tone = "text-white" }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </p>
      <p className={`whitespace-pre-wrap break-words text-sm leading-6 ${tone}`}>
        {text || <span className="text-zinc-600">&hellip;</span>}
      </p>
    </div>
  );
}

export function LiveTranslationDock({
  draft,
  status,
  isExpanded,
  onToggleExpanded,
}) {
  const transcriptRef = useRef(null);
  const isActive =
    status === "starting" ||
    status === "listening" ||
    status === "processing" ||
    status === "stopping";

  useEffect(() => {
    const container = transcriptRef.current;

    if (!container) {
      return;
    }

    container.scrollTo({
      top: container.scrollHeight,
      behavior: "smooth",
    });
  }, [draft?.transcript, draft?.translatedText, isExpanded]);

  const sourceLanguage = draft?.sourceLanguage;
  const targetLanguage = draft?.targetLanguage;
  const statusLabel = isActive ? "Live" : "Live paused";

  return (
    <section
      className={`mt-3 overflow-hidden rounded-[1.7rem] border border-white/10 bg-zinc-900/85 shadow-2xl backdrop-blur-xl transition-[max-height] duration-300 ${
        isExpanded ? "max-h-[min(42vh,28rem)]" : "max-h-[13rem]"
      }`}
      aria-label="Live translation"
    >
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Radio
            size={16}
            className={isActive ? "animate-pulse text-rose-400" : "text-zinc-500"}
            aria-hidden="true"
          />
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
            {statusLabel}
          </span>
          {isActive && !draft?.transcript ? (
            <AudioWave active colorClass="bg-rose-400" />
          ) : null}
        </div>

        <button
          type="button"
          onClick={onToggleExpanded}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-300 transition hover:bg-white/10 hover:text-white"
          title={isExpanded ? "Minimize live translation" : "Expand live translation"}
          aria-label={isExpanded ? "Minimize live translation" : "Expand live translation"}
        >
          {isExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
      </div>

      <div
        ref={transcriptRef}
        className="max-h-[calc(min(42vh,28rem)-3.75rem)] overflow-y-auto px-4 py-3 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        {draft?.transcript || draft?.translatedText ? (
          <div className="space-y-3">
            <LanguageLine
              label={sourceLanguage?.name ?? draft.sourceLanguageLabel ?? "Spoken"}
              text={draft.transcript}
            />
            <div className="border-t border-white/10 pt-3">
              <LanguageLine
                label={targetLanguage?.name ?? draft.targetLanguageLabel ?? "Translation"}
                text={draft.translatedText}
                tone="text-zinc-200"
              />
            </div>
          </div>
        ) : (
          <div className="flex min-h-16 items-center justify-center">
            <AudioWave active={isActive} colorClass="bg-zinc-500" />
          </div>
        )}
      </div>
    </section>
  );
}
