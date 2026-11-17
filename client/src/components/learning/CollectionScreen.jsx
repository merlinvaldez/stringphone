import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Dices,
  GraduationCap,
  Loader2,
  Menu,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  archiveCollectionEntry,
  fetchCollection,
  fetchCollections,
  fetchMessages,
  saveCollectionEntry,
  translateTextMessage,
  updateCollectionEntry,
} from "../../chatApi.js";
import {
  createBlobUrlTracker,
  getTextDirectionAttrs,
} from "../../chatParityHelpers.js";
import { LanguageFlag, getFlagCountryCode } from "../../languageFlags.jsx";
import { useUiStrings } from "../../uiStrings.js";
import { formatPronunciationGuide } from "../../utils.js";
import { TextToSpeechButton } from "../audio/TextToSpeechButton.jsx";
import { VoiceMessagePlayer } from "../chat/VoiceMessagePlayer.jsx";
import { PhraseEditorModal } from "./PhraseEditorModal.jsx";
import {
  getFlashcardBackDisplay,
  validatePhrasebookEditorInput,
} from "./phrasebookHelpers.js";

function toPlayableStoredAudioUrl(value) {
  if (typeof value !== "string") {
    return "";
  }

  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return "";
  }

  if (/^(blob:|data:|https?:)/i.test(trimmedValue)) {
    return trimmedValue;
  }

  return `data:audio/mpeg;base64,${trimmedValue}`;
}

function PronunciationGuide({ value, className = "" }) {
  const pronunciation = formatPronunciationGuide(value);

  if (!pronunciation) {
    return null;
  }

  return <p className={className}>({pronunciation})</p>;
}

function HistoryShortcutButton({ onClick }) {
  if (!onClick) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-300 transition hover:bg-white/10 hover:text-white"
      title="History"
      aria-label="Open history"
    >
      <Menu size={18} />
    </button>
  );
}

function SearchField({
  value,
  onChange,
  placeholder,
}) {
  return (
    <label className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/20 px-3 py-2.5 text-zinc-300">
      <Search size={15} className="text-zinc-500" strokeWidth={1.8} />
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full bg-transparent text-sm text-white outline-none placeholder:text-zinc-500"
      />
    </label>
  );
}

function CollectionComposer({
  availableLanguages,
  selectedLanguageCode,
  sourceLanguageCode = "en",
  languageSearchQuery,
  onLanguageSearchQueryChange,
  onSelectLanguageCode,
  allowLanguageSelection,
  sourceText,
  onSourceTextChange,
  isManualMode,
  onToggleManualMode,
  manualPhraseText,
  onManualPhraseTextChange,
  manualPhrasePronunciation,
  onManualPhrasePronunciationChange,
  manualMeaningText,
  onManualMeaningTextChange,
  manualMeaningPronunciation,
  onManualMeaningPronunciationChange,
  manualNoteText,
  onManualNoteTextChange,
  requireMeaning,
  onCancel,
  onSave,
  isSaving,
  error,
}) {
  const filteredLanguages = useMemo(() => {
    const normalizedQuery = languageSearchQuery.trim().toLowerCase();

    return availableLanguages.filter((language) => {
      if (!normalizedQuery) {
        return true;
      }

      const haystack = [
        language.name,
        language.englishName,
        language.code,
      ]
        .join("\n")
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [availableLanguages, languageSearchQuery]);

  const phraseDirAttrs = getTextDirectionAttrs(selectedLanguageCode);
  const sourceDirAttrs = getTextDirectionAttrs(sourceLanguageCode);

  return (
    <div className="rounded-[1.75rem] border border-white/10 bg-zinc-900/95 p-5 shadow-2xl backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-300">
            <Plus size={13} />
            New card
          </div>
          <button
            type="button"
            onClick={onToggleManualMode}
            className="rounded-full px-2.5 py-1 text-xs font-medium text-emerald-400 hover:text-emerald-300 hover:bg-emerald-400/10 transition"
          >
            {isManualMode ? "Quick add" : "Manual fields"}
          </button>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-300 transition hover:bg-white/10 hover:text-white"
          aria-label="Close"
          title="Close"
        >
          <X size={15} />
        </button>
      </div>

      {allowLanguageSelection ? (
        <div className="mt-4 space-y-3">
          <SearchField
            value={languageSearchQuery}
            onChange={onLanguageSearchQueryChange}
            placeholder="Search phrasebook language"
          />
          <div className="max-h-36 overflow-y-auto rounded-2xl border border-white/10 bg-black/20 p-1.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {filteredLanguages.map((language) => (
              <button
                key={language.code}
                type="button"
                onClick={() => onSelectLanguageCode(language.code)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition ${
                  selectedLanguageCode === language.code
                    ? "bg-white/10 text-white"
                    : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                }`}
              >
                <LanguageFlag
                  countryCode={getFlagCountryCode(language.code)}
                  label={language.name}
                  className="h-4 w-6"
                />
                <span className="truncate">{language.name}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {isManualMode ? (
        <div className="mt-4 space-y-3">
          <div>
            <input
              value={manualPhraseText}
              onChange={(e) => onManualPhraseTextChange(e.target.value)}
              placeholder="Phrase"
              aria-label="Phrase"
              dir={phraseDirAttrs.dir}
              className={`h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3.5 text-sm text-white placeholder:text-zinc-500 outline-none focus:border-emerald-400/40 ${phraseDirAttrs.className}`}
            />
          </div>
          <div>
            <input
              value={manualPhrasePronunciation}
              onChange={(e) => onManualPhrasePronunciationChange(e.target.value)}
              placeholder="Phrase pronunciation (optional)"
              aria-label="Phrase pronunciation"
              dir={phraseDirAttrs.dir}
              className={`h-10 w-full rounded-xl border border-white/10 bg-black/30 px-3.5 text-sm text-white placeholder:text-zinc-500 outline-none focus:border-emerald-400/40 ${phraseDirAttrs.className}`}
            />
          </div>
          <div>
            <input
              value={manualMeaningText}
              onChange={(e) => onManualMeaningTextChange(e.target.value)}
              placeholder={requireMeaning ? "Meaning" : "Meaning (optional)"}
              aria-label="Meaning"
              dir={sourceDirAttrs.dir}
              className={`h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3.5 text-sm text-white placeholder:text-zinc-500 outline-none focus:border-emerald-400/40 ${sourceDirAttrs.className}`}
            />
          </div>
          <div>
            <input
              value={manualMeaningPronunciation}
              onChange={(e) => onManualMeaningPronunciationChange(e.target.value)}
              placeholder="Meaning pronunciation (optional)"
              aria-label="Meaning pronunciation"
              dir={sourceDirAttrs.dir}
              className={`h-10 w-full rounded-xl border border-white/10 bg-black/30 px-3.5 text-sm text-white placeholder:text-zinc-500 outline-none focus:border-emerald-400/40 ${sourceDirAttrs.className}`}
            />
          </div>
          <div>
            <input
              value={manualNoteText}
              onChange={(e) => onManualNoteTextChange(e.target.value)}
              placeholder="Note (optional)"
              aria-label="Note"
              className="h-10 w-full rounded-xl border border-white/10 bg-black/30 px-3.5 text-sm text-white placeholder:text-zinc-500 outline-none focus:border-emerald-400/40"
            />
          </div>
        </div>
      ) : (
        <div className="mt-4 grid gap-3">
          <input
            value={sourceText}
            onChange={(event) => onSourceTextChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void onSave();
              }
            }}
            placeholder="Word or phrase"
            dir={sourceDirAttrs.dir}
            className={`h-12 rounded-2xl border border-white/10 bg-black/20 px-4 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-emerald-400/40 ${sourceDirAttrs.className}`}
          />
        </div>
      )}

      {error ? (
        <p className="mt-4 rounded-xl border border-rose-400/15 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      ) : null}

      <div className="mt-5 flex items-center justify-between">
        {!isManualMode ? (
          <button
            type="button"
            onClick={onToggleManualMode}
            className="text-xs text-zinc-400 hover:text-zinc-200 transition"
          >
            Manual fields
          </button>
        ) : <div />}

        <button
          type="button"
          onClick={() => void onSave()}
          disabled={
            isSaving ||
            (isManualMode
              ? !manualPhraseText.trim() || (requireMeaning && !manualMeaningText.trim())
              : !sourceText.trim())
          }
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSaving ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Bookmark size={16} />
          )}
          {isSaving ? (isManualMode ? "Saving..." : "Translating...") : "Save"}
        </button>
      </div>
    </div>
  );
}

function CollectionRootView({
  collections,
  loading,
  error,
  searchQuery,
  onSearchQueryChange,
  onOpenSidebar,
  onOpenComposer,
  onSelectCollection,
}) {
  return (
    <div className="mx-auto flex h-full w-full max-w-4xl flex-col overflow-y-auto px-4 pb-8 pt-28 sm:px-6 sm:pt-32">
      <div className="mx-auto mb-4 flex w-full max-w-2xl justify-start">
        <HistoryShortcutButton onClick={onOpenSidebar} />
      </div>

      <div className="mx-auto w-full max-w-2xl space-y-4">
        <div className="rounded-[2rem] border border-white/10 bg-zinc-900/70 p-5 shadow-2xl backdrop-blur-xl sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-3 rounded-[1.5rem] border border-emerald-300/16 bg-[linear-gradient(135deg,rgba(16,185,129,0.12),rgba(24,24,27,0.88))] px-3.5 py-3 shadow-[0_18px_40px_rgba(0,0,0,0.22)] ring-1 ring-inset ring-white/5">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[1rem] border border-emerald-300/20 bg-emerald-400/[0.12] text-emerald-100 shadow-[0_0_24px_rgba(16,185,129,0.10)]">
                  <Bookmark size={20} />
                </span>
                <p className="pr-1 text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-emerald-100/90">
                  Phrasebook
                </p>
              </div>
              <p className="mt-4 text-sm leading-6 text-zinc-300">
                Words and phrases you want to remember.
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenComposer}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-zinc-200 transition hover:bg-white/[0.08]"
              title="Add phrasebook card"
              aria-label="Add phrasebook card"
            >
              <Plus size={18} />
            </button>
          </div>

          <div className="mt-5">
            <SearchField
              value={searchQuery}
              onChange={onSearchQueryChange}
              placeholder="Search phrasebook"
            />
          </div>
        </div>

        {error ? (
          <div className="rounded-xl border border-rose-400/15 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {error}
          </div>
        ) : null}

        <div className="rounded-[1.75rem] border border-white/10 bg-zinc-900/70 p-3 shadow-xl backdrop-blur-xl">
          {loading ? (
            <div className="flex justify-center p-8">
              <Loader2 size={24} className="animate-spin text-zinc-500" />
            </div>
          ) : collections.length === 0 ? (
            <div className="p-8 text-center text-sm text-zinc-500">
              No phrasebook cards yet.
            </div>
          ) : (
            collections.map((collection) => (
              <button
                key={collection.id || collection.languageCode}
                type="button"
                onClick={() => onSelectCollection(collection.languageCode)}
                className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition hover:bg-white/[0.05]"
              >
                <LanguageFlag
                  countryCode={getFlagCountryCode(collection.languageCode)}
                  label={collection.languageName}
                  className="h-5 w-7 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-white">
                    {collection.languageName}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {collection.entryCount ?? collection.count ?? 0} {(collection.entryCount ?? collection.count ?? 0) === 1 ? "card" : "cards"}
                  </p>
                </div>
                <ChevronRight size={16} className="text-zinc-500" />
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function CollectionDetailView({
  collection,
  loading,
  error,
  searchQuery,
  onSearchQueryChange,
  onBack,
  onOpenSidebar,
  onOpenComposer,
  onEditEntry,
  onArchiveEntry,
  archivingEntryId,
  activeViewerEntryId,
  onActiveViewerEntryIdChange,
  authFetch,
  isSignedIn,
  localStore,
  ttsVoice,
  stopAllPlayback,
  onAudioPlay,
  onPlayGeneratedSpeech,
  uiStrings,
}) {
  const [openEntryMenuId, setOpenEntryMenuId] = useState(null);
  const viewerEntryIndex = collection.entries.findIndex(
    (entry) => entry.id === activeViewerEntryId,
  );

  useEffect(() => {
    if (!openEntryMenuId) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (
        event.target instanceof Element &&
        event.target.closest("[data-collection-card-actions]")
      ) {
        return;
      }

      setOpenEntryMenuId(null);
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setOpenEntryMenuId(null);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [openEntryMenuId]);

  useEffect(() => {
    if (!activeViewerEntryId) {
      return;
    }

    if (!collection.entries.some((entry) => entry.id === activeViewerEntryId)) {
      onActiveViewerEntryIdChange(null);
    }
  }, [activeViewerEntryId, collection.entries, onActiveViewerEntryIdChange]);

  const openViewer = (entryId) => {
    setOpenEntryMenuId(null);
    onActiveViewerEntryIdChange(entryId);
  };

  const handleCardKeyDown = (event, entryId) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openViewer(entryId);
    }
  };

  return (
    <>
      <div className="mx-auto flex h-full w-full max-w-4xl flex-col overflow-y-auto px-4 pb-8 pt-28 sm:px-6 sm:pt-32">
        <div className="mx-auto mb-4 flex w-full max-w-3xl items-center justify-between gap-3">
          <HistoryShortcutButton onClick={onOpenSidebar} />
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-300 transition hover:bg-white/10 hover:text-white"
            title="Back to phrasebook"
            aria-label="Back to phrasebook"
          >
            <ChevronLeft size={18} />
          </button>
        </div>

        <div className="mx-auto w-full max-w-3xl space-y-4">
          <div className="rounded-[2rem] border border-white/10 bg-zinc-900/70 p-5 shadow-2xl backdrop-blur-xl sm:p-6">
            <div className="flex items-start gap-3">
              <LanguageFlag
                countryCode={getFlagCountryCode(collection.languageCode)}
                label={collection.languageName}
                className="mt-1 h-6 w-8 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                  {collection.languageName}
                </h1>
                <p className="mt-2 text-sm text-zinc-400">
                  {collection.entryCount ?? collection.entries.length} {(collection.entryCount ?? collection.entries.length) === 1 ? "card" : "cards"}
                </p>
              </div>
            </div>
            <div className="mt-5">
              <SearchField
                value={searchQuery}
                onChange={onSearchQueryChange}
                placeholder={`Search ${collection.languageName}`}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenComposer}
            className="inline-flex h-12 w-full items-center justify-center rounded-[1.5rem] border border-white/10 bg-zinc-900/70 text-zinc-300 shadow-xl backdrop-blur-xl transition hover:border-white/15 hover:bg-white/[0.06] hover:text-white"
            title="Add phrasebook card"
            aria-label="Add phrasebook card"
          >
            <Plus size={18} />
          </button>

          {error ? (
            <div className="rounded-xl border border-rose-400/15 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {error}
            </div>
          ) : null}

          <div className="space-y-3">
            {loading ? (
              <div className="flex justify-center p-8">
                <Loader2 size={24} className="animate-spin text-zinc-500" />
              </div>
            ) : collection.entries.length === 0 ? (
              <div className="rounded-[1.75rem] border border-white/10 bg-zinc-900/70 p-8 text-center text-sm text-zinc-500 shadow-xl backdrop-blur-xl">
                No cards in this phrasebook yet.
              </div>
            ) : (
              collection.entries.map((entry) => {
                const isArchiving = archivingEntryId === entry.id;
                const isMenuOpen = openEntryMenuId === entry.id;

                return (
                  <div
                    key={entry.id}
                    className="rounded-[1.75rem] border border-white/10 bg-zinc-900/70 p-5 shadow-xl backdrop-blur-xl"
                  >
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => openViewer(entry.id)}
                        onKeyDown={(event) => handleCardKeyDown(event, entry.id)}
                        className="min-w-0 cursor-pointer text-left outline-none"
                      >
                        <div className="flex items-start gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-base font-semibold leading-6 text-white">
                              {entry.phraseText}
                            </p>
                            <PronunciationGuide
                              value={entry.phrasePronunciation}
                              className="mt-2 text-sm text-emerald-200/80"
                            />
                          </div>
                          <div onClick={(event) => event.stopPropagation()}>
                            <TextToSpeechButton
                              text={entry.phraseText}
                              languageCode={entry.targetLanguageCode}
                              onPlay={
                                onPlayGeneratedSpeech
                                  ? (payload) =>
                                      onPlayGeneratedSpeech({
                                        ...payload,
                                        ownerKind: "phrasebook",
                                        ownerId: entry.id,
                                        role: "translated",
                                        speechVoice: ttsVoice,
                                      })
                                  : undefined
                              }
                              uiStrings={uiStrings}
                              className="mt-0.5"
                            />
                          </div>
                        </div>

                        {entry.meaningPronunciation ? (
                          <PronunciationGuide
                            value={entry.meaningPronunciation}
                            className="mt-1 text-xs text-sky-200/75"
                          />
                        ) : null}

                        {entry.meaningText ? (
                          <p className="mt-3 text-sm leading-6 text-zinc-300">
                            {entry.meaningText}
                          </p>
                        ) : null}

                        {entry.noteText ? (
                          <p className="mt-3 text-xs leading-5 text-zinc-500">
                            {entry.noteText}
                          </p>
                        ) : null}
                      </div>

                      <div
                        data-collection-card-actions
                        onClick={(event) => event.stopPropagation()}
                        className="flex items-center gap-1 self-start"
                      >
                        <button
                          type="button"
                          aria-label="Edit card"
                          title="Edit card"
                          onClick={() => {
                            setOpenEntryMenuId(null);
                            onEditEntry(entry);
                          }}
                          disabled={isArchiving}
                          className={`flex items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-white/5 text-zinc-300 transition-all duration-200 hover:bg-white/10 hover:text-white ${
                            isMenuOpen
                              ? "pointer-events-auto max-w-9 translate-x-0 p-2 opacity-100"
                              : "pointer-events-none max-w-0 translate-x-2 p-0 opacity-0"
                          }`}
                        >
                          <Pencil size={12} className="shrink-0" />
                        </button>

                        <button
                          type="button"
                          aria-label={isSignedIn ? "Archive card" : "Delete card"}
                          title={isSignedIn ? "Archive card" : "Delete card"}
                          onClick={() => {
                            void onArchiveEntry(entry.id);
                          }}
                          disabled={isArchiving}
                          className={`flex items-center justify-center overflow-hidden rounded-lg border border-rose-500/20 bg-rose-500/10 text-rose-300 transition-all duration-200 hover:bg-rose-500/15 hover:text-rose-200 ${
                            isMenuOpen
                              ? "pointer-events-auto max-w-9 translate-x-0 p-2 opacity-100"
                              : "pointer-events-none max-w-0 translate-x-2 p-0 opacity-0"
                          } ${isArchiving ? "cursor-wait" : ""}`}
                        >
                          {isArchiving ? (
                            <Loader2 size={12} className="shrink-0 animate-spin" />
                          ) : (
                            <Trash2 size={12} className="shrink-0" />
                          )}
                        </button>

                        <button
                          type="button"
                          aria-label="Card actions"
                          title="Card actions"
                          onClick={() => {
                            setOpenEntryMenuId((currentId) =>
                              currentId === entry.id ? null : entry.id,
                            );
                          }}
                          disabled={isArchiving}
                          className={`rounded-lg p-2 text-zinc-500 transition hover:bg-white/10 hover:text-white focus-visible:bg-white/10 focus-visible:text-white ${
                            isArchiving ? "cursor-wait" : ""
                          }`}
                        >
                          <MoreVertical size={15} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {viewerEntryIndex >= 0 ? (
        <CollectionEntryViewer
          entries={collection.entries}
          activeEntryIndex={viewerEntryIndex}
          onClose={() => {
            stopAllPlayback?.();
            onActiveViewerEntryIdChange(null);
          }}
          onSelectIndex={(nextIndex) =>
            onActiveViewerEntryIdChange(
              collection.entries[nextIndex]?.id ?? null,
            )
          }
          authFetch={authFetch}
          isSignedIn={isSignedIn}
          localStore={localStore}
          ttsVoice={ttsVoice}
          stopAllPlayback={stopAllPlayback}
          onAudioPlay={onAudioPlay}
          onPlayGeneratedSpeech={onPlayGeneratedSpeech}
          uiStrings={uiStrings}
        />
      ) : null}
    </>
  );
}

function CollectionEntryViewer({
  entries,
  activeEntryIndex,
  onClose,
  onSelectIndex,
  authFetch,
  isSignedIn,
  localStore,
  ttsVoice,
  stopAllPlayback,
  onAudioPlay,
  onPlayGeneratedSpeech,
  uiStrings,
}) {
  const touchStartXRef = useRef(null);
  const touchStartYRef = useRef(null);
  const touchCurrentXRef = useRef(null);
  const touchCurrentYRef = useRef(null);
  const didSwipeRef = useRef(false);
  const blobTrackerRef = useRef(null);
  if (!blobTrackerRef.current) {
    blobTrackerRef.current = createBlobUrlTracker();
  }

  const [displayedIndex, setDisplayedIndex] = useState(activeEntryIndex);
  const [isDragging, setIsDragging] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);
  const [originalAudioUrl, setOriginalAudioUrl] = useState("");
  const entry = entries[displayedIndex] ?? null;
  const sourceSnapshot = entry?.sourceSnapshot ?? null;
  const canNavigate = entries.length > 1;
  const hasRandomAlternative = entries.length > 1;

  const stopAllPlaybackRef = useRef(stopAllPlayback);
  useEffect(() => {
    stopAllPlaybackRef.current = stopAllPlayback;
  });

  useEffect(() => {
    return () => {
      blobTrackerRef.current?.revokeAll();
      stopAllPlaybackRef.current?.();
    };
  }, []);

  const handleClose = () => {
    stopAllPlaybackRef.current?.();
    onClose?.();
  };

  useEffect(() => {
    if (activeEntryIndex !== displayedIndex) {
      setDisplayedIndex(activeEntryIndex);
    }
  }, [activeEntryIndex, displayedIndex]);

  useEffect(() => {
    if (!entry) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        handleClose();
        return;
      }

      if (event.key === "ArrowLeft" && canNavigate) {
        triggerSlideNavigation(-1);
        return;
      }

      if (event.key === "ArrowRight" && canNavigate) {
        triggerSlideNavigation(1);
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [canNavigate, entry, onClose]);

  useEffect(() => {
    setIsFlipped(false);
  }, [activeEntryIndex, displayedIndex]);

  useEffect(() => {
    let cancelled = false;
    stopAllPlayback?.();
    setOriginalAudioUrl("");

    if (!entry) return () => { cancelled = true; };

    const fallbackAudioUrl = toPlayableStoredAudioUrl(
      sourceSnapshot?.sourceAudioUrl,
    );

    // Guest mode: resolve audio asset from localStore if stored
    if (!isSignedIn && localStore && (entry.sourceAudioId || entry.meaningAudioId)) {
      const audioId = entry.sourceAudioId || entry.meaningAudioId;
      localStore.getAudioAsset(audioId)
        .then((asset) => {
          if (!cancelled && asset?.blob) {
            const url = blobTrackerRef.current.getOrCreate(audioId, asset.blob);
            setOriginalAudioUrl(url);
          }
        })
        .catch(() => {});

      return () => {
        cancelled = true;
      };
    }

    if (
      entry.sourceType !== "message" ||
      entry.sourceMessageKind !== "voice"
    ) {
      return () => {
        cancelled = true;
      };
    }

    if (!authFetch || !entry.sourceConversationId) {
      setOriginalAudioUrl(fallbackAudioUrl);
      return () => {
        cancelled = true;
      };
    }

    void fetchMessages(authFetch, entry.sourceConversationId)
      .then((messages) => {
        const sourceMessageId = sourceSnapshot?.messageId;
        const sourceMessage = messages.find((message) => {
          if (sourceMessageId && message.id === sourceMessageId) {
            return true;
          }

          return (
            message.sender === entry.sourceMessageSender &&
            message.original_text === sourceSnapshot?.originalText &&
            message.translated_text === sourceSnapshot?.translatedText
          );
        });
        const nextAudioUrl = toPlayableStoredAudioUrl(sourceMessage?.audio_url);

        if (!cancelled) {
          setOriginalAudioUrl(nextAudioUrl || fallbackAudioUrl);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOriginalAudioUrl(fallbackAudioUrl);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [authFetch, entry, isSignedIn, localStore, sourceSnapshot, stopAllPlayback]);

  if (!entry) {
    return null;
  }

  const originalVoiceLanguageCode =
    typeof sourceSnapshot?.sourceLanguageCode === "string"
      ? sourceSnapshot.sourceLanguageCode
      : "";
  const originalVoiceIsPhrase =
    Boolean(originalAudioUrl) &&
    (originalVoiceLanguageCode
      ? originalVoiceLanguageCode === entry.targetLanguageCode
      : entry.sourceMessageSender === "partner");
  const originalVoiceIsMeaning = Boolean(originalAudioUrl) && !originalVoiceIsPhrase;
  const originalVoiceUiStrings = {
    ...uiStrings,
    playAudio: "Play original voice note",
    preparingAudio: "Loading original voice note",
  };
  const phraseSpeechUiStrings = {
    ...uiStrings,
    playAudio: "Play learning-language audio",
    generatingAudio: "Generating learning-language audio",
    audioUnavailable: "Learning-language audio unavailable.",
  };
  const meaningSpeechUiStrings = {
    ...uiStrings,
    playAudio: "Play your-language audio",
    generatingAudio: "Generating your-language audio",
    audioUnavailable: "Your-language audio unavailable.",
  };

  const handleFlip = () => {
    if (isDragging || didSwipeRef.current) {
      didSwipeRef.current = false;
      return;
    }

    setIsFlipped((currentValue) => !currentValue);
  };

  const triggerSlideNavigation = (direction) => {
    if (isDragging || !canNavigate) {
      return;
    }

    const nextIndex =
      (displayedIndex + direction + entries.length) % entries.length;

    setDisplayedIndex(nextIndex);
    setIsFlipped(false);
    onSelectIndex(nextIndex);
  };

  const handleTouchStart = (event) => {
    touchStartXRef.current = event.touches[0]?.clientX ?? null;
    touchStartYRef.current = event.touches[0]?.clientY ?? null;
    touchCurrentXRef.current = touchStartXRef.current;
    touchCurrentYRef.current = touchStartYRef.current;
    didSwipeRef.current = false;
    setIsDragging(false);
  };

  const handleTouchMove = (event) => {
    const nextX = event.touches[0]?.clientX ?? touchCurrentXRef.current;
    const nextY = event.touches[0]?.clientY ?? touchCurrentYRef.current;

    touchCurrentXRef.current = nextX;
    touchCurrentYRef.current = nextY;

    if (
      touchStartXRef.current == null ||
      touchStartYRef.current == null ||
      nextX == null ||
      nextY == null
    ) {
      return;
    }

    const deltaX = nextX - touchStartXRef.current;
    const deltaY = nextY - touchStartYRef.current;

    if (!isDragging && Math.abs(deltaX) <= Math.abs(deltaY)) {
      return;
    }

    didSwipeRef.current = true;
    setIsDragging(true);
  };

  const handleTouchEnd = () => {
    if (
      touchStartXRef.current == null ||
      touchCurrentXRef.current == null
    ) {
      return;
    }

    const deltaX = touchCurrentXRef.current - touchStartXRef.current;
    const threshold = 56;

    touchStartXRef.current = null;
    touchStartYRef.current = null;
    touchCurrentXRef.current = null;
    touchCurrentYRef.current = null;

    if (deltaX >= threshold && canNavigate) {
      setIsDragging(false);
      triggerSlideNavigation(-1);
      return;
    }

    if (deltaX <= -threshold && canNavigate) {
      setIsDragging(false);
      triggerSlideNavigation(1);
      return;
    }

    setIsDragging(false);
  };

  const handleSelectRandomEntry = () => {
    if (!hasRandomAlternative || isDragging) {
      return;
    }

    let nextIndex = displayedIndex;

    while (nextIndex === displayedIndex) {
      nextIndex = Math.floor(Math.random() * entries.length);
    }

    setDisplayedIndex(nextIndex);
    setIsFlipped(false);
    onSelectIndex(nextIndex);
  };

  const backDisplay = getFlashcardBackDisplay(entry);

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div className="mx-auto flex h-full max-w-5xl items-center justify-center px-12 py-4 sm:px-0 sm:py-6">
        <div
          className="relative h-[min(76vh,42rem)] w-full max-w-3xl [perspective:1200px]"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={handleSelectRandomEntry}
            disabled={!hasRandomAlternative || isDragging}
            className={`absolute left-4 top-4 z-20 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/10 text-zinc-300 transition hover:bg-white/10 hover:text-white sm:left-5 sm:top-5 ${
              !hasRandomAlternative || isDragging
                ? "cursor-default opacity-30 hover:bg-white/5 hover:text-zinc-300"
                : ""
            }`}
            aria-label="Random card"
            title="Random card"
          >
            <Dices size={18} />
          </button>

          <button
            type="button"
            onClick={handleClose}
            className="absolute right-4 top-4 z-20 inline-flex p-2 text-zinc-400 transition hover:text-white sm:right-5 sm:top-5"
            aria-label="Close card viewer"
            title="Close card viewer"
          >
            <X size={20} />
          </button>

          <div className="relative h-full w-full">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                triggerSlideNavigation(-1);
              }}
              disabled={!canNavigate || isDragging}
              className={`absolute -left-12 top-1/2 z-20 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-300 transition hover:bg-white/10 hover:text-white sm:-left-14 ${
                !canNavigate || isDragging
                  ? "cursor-default opacity-30 hover:bg-white/5 hover:text-zinc-300"
                  : ""
              }`}
              aria-label="Previous card"
              title="Previous card"
            >
              <ChevronLeft size={20} />
            </button>

            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                triggerSlideNavigation(1);
              }}
              disabled={!canNavigate || isDragging}
              className={`absolute -right-12 top-1/2 z-20 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-300 transition hover:bg-white/10 hover:text-white sm:-right-14 ${
                !canNavigate || isDragging
                  ? "cursor-default opacity-30 hover:bg-white/5 hover:text-zinc-300"
                  : ""
              }`}
              aria-label="Next card"
              title="Next card"
            >
              <ChevronRight size={20} />
            </button>

            <div
              className="relative h-full w-full cursor-pointer [transform-style:preserve-3d]"
              onClick={handleFlip}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              {/* Front of card */}
              <div
                className="absolute inset-0 flex flex-col items-center justify-center rounded-[2.25rem] border border-emerald-400/20 bg-emerald-950 p-8 pt-20 text-center shadow-[0_0_60px_rgba(16,185,129,0.08)] [backface-visibility:hidden] sm:p-12 sm:pt-20"
                style={{
                  transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
                  transition: "transform 500ms ease",
                }}
              >
                <div className="flex max-w-full items-center justify-center gap-3">
                  <p className="text-3xl font-semibold leading-tight tracking-tight text-white sm:text-5xl">
                    {entry.phraseText}
                  </p>
                  <div onClick={(event) => event.stopPropagation()}>
                    {originalVoiceIsPhrase ? (
                      <VoiceMessagePlayer
                        audioUrl={originalAudioUrl}
                        onAudioPlay={onAudioPlay}
                        isSelf={entry.sourceMessageSender === "self"}
                        uiStrings={originalVoiceUiStrings}
                      />
                    ) : (
                      <TextToSpeechButton
                        text={entry.phraseText}
                        languageCode={entry.targetLanguageCode}
                        onPlay={
                          onPlayGeneratedSpeech
                            ? (payload) =>
                                onPlayGeneratedSpeech({
                                  ...payload,
                                  ownerKind: "phrasebook",
                                  ownerId: entry.id,
                                  role: "translated",
                                  speechVoice: ttsVoice,
                                })
                            : undefined
                        }
                        uiStrings={phraseSpeechUiStrings}
                        className="shrink-0"
                      />
                    )}
                  </div>
                </div>
                <PronunciationGuide
                  value={entry.phrasePronunciation}
                  className="mt-4 text-base text-emerald-200/80 sm:text-lg"
                />
              </div>

              {/* Back of card */}
              <div
                className="absolute inset-0 flex flex-col items-center justify-center rounded-[2.25rem] border border-sky-400/20 bg-sky-950 p-8 pt-20 text-center shadow-[0_0_60px_rgba(56,189,248,0.08)] [backface-visibility:hidden] sm:p-12 sm:pt-20"
                style={{
                  transform: isFlipped ? "rotateY(0deg)" : "rotateY(-180deg)",
                  transition: "transform 500ms ease",
                }}
              >
                {backDisplay.hasMeaning ? (
                  <>
                    <p className="text-3xl font-semibold leading-tight tracking-tight text-white sm:text-5xl">
                      {backDisplay.meaningText}
                    </p>
                    <PronunciationGuide
                      value={backDisplay.meaningPronunciation}
                      className="mt-4 text-base text-sky-200/80 sm:text-lg"
                    />
                  </>
                ) : null}

                {backDisplay.noteText ? (
                  <p
                    className={`max-w-2xl text-sm leading-7 text-zinc-300 sm:text-base ${
                      backDisplay.hasMeaning
                        ? "mt-8"
                        : "text-xl font-medium text-white sm:text-2xl"
                    }`}
                  >
                    {backDisplay.noteText}
                  </p>
                ) : null}

                <p className="mt-6 text-xs uppercase tracking-widest text-zinc-400">
                  {backDisplay.flipPrompt}
                </p>

                {backDisplay.canPlayMeaningAudio ? (
                  <div
                    className="mt-8"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {originalVoiceIsMeaning ? (
                      <VoiceMessagePlayer
                        audioUrl={originalAudioUrl}
                        onAudioPlay={onAudioPlay}
                        isSelf={entry.sourceMessageSender === "self"}
                        uiStrings={originalVoiceUiStrings}
                      />
                    ) : (
                      <TextToSpeechButton
                        text={backDisplay.meaningText}
                        languageCode={entry.sourceLanguageCode}
                        onPlay={
                          onPlayGeneratedSpeech
                            ? (payload) =>
                                onPlayGeneratedSpeech({
                                  ...payload,
                                  ownerKind: "phrasebook",
                                  ownerId: entry.id,
                                  role: "source",
                                  speechVoice: ttsVoice,
                                })
                            : undefined
                        }
                        uiStrings={meaningSpeechUiStrings}
                      />
                    )}
                  </div>
                ) : null}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

export function CollectionScreen({
  authFetch,
  isSignedIn,
  myLang,
  theirLang,
  availableLanguages = [],
  activeLanguageCode,
  onSelectLanguageCode,
  onOpenSidebar,
  onRequireSignIn,
  onAudioPlay,
  onPlayGeneratedSpeech,
  localStore = null,
  ttsVoice = null,
  stopAllPlayback = null,
  onPhrasebookChanged = null,
}) {
  const [collections, setCollections] = useState([]);
  const [collectionDetail, setCollectionDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Composer state
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [composerError, setComposerError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [languageSearchQuery, setLanguageSearchQuery] = useState("");
  const [selectedLanguageCode, setSelectedLanguageCode] = useState(
    activeLanguageCode ?? theirLang.code,
  );
  const [sourceText, setSourceText] = useState("");

  // Manual fields state for Composer
  const [isManualMode, setIsManualMode] = useState(false);
  const [manualPhraseText, setManualPhraseText] = useState("");
  const [manualPhrasePronunciation, setManualPhrasePronunciation] = useState("");
  const [manualMeaningText, setManualMeaningText] = useState("");
  const [manualMeaningPronunciation, setManualMeaningPronunciation] = useState("");
  const [manualNoteText, setManualNoteText] = useState("");

  // Viewer and card actions state
  const [activeViewerEntryId, setActiveViewerEntryId] = useState(null);
  const [archivingEntryId, setArchivingEntryId] = useState(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  // Edit Card Modal state
  const [editingEntry, setEditingEntry] = useState(null);
  const [isEditorModalOpen, setIsEditorModalOpen] = useState(false);
  const [editorError, setEditorError] = useState("");
  const [isEditorSaving, setIsEditorSaving] = useState(false);

  const uiStrings = useUiStrings(myLang);

  useEffect(() => {
    setSearchQuery("");
  }, [activeLanguageCode]);

  useEffect(() => {
    if (!activeLanguageCode) {
      setSelectedLanguageCode(theirLang.code);
      return;
    }

    setSelectedLanguageCode(activeLanguageCode);
  }, [activeLanguageCode, theirLang.code]);

  useEffect(() => {
    let cancelled = false;

    const loadCollections = async () => {
      try {
        setLoading(true);
        setError("");

        if (isSignedIn) {
          if (activeLanguageCode) {
            const detail = await fetchCollection(authFetch, activeLanguageCode, {
              q: searchQuery,
            });

            if (!cancelled) {
              setCollectionDetail(detail);
            }
            return;
          }

          const summaries = await fetchCollections(authFetch, { q: searchQuery });

          if (!cancelled) {
            setCollections(summaries);
          }
        } else if (localStore) {
          if (activeLanguageCode) {
            const detail = await localStore.getPhrasebookCollection(
              activeLanguageCode,
              searchQuery,
            );

            if (!cancelled) {
              const langObj = availableLanguages.find(
                (l) => l.code === activeLanguageCode,
              );
              setCollectionDetail(
                detail ?? {
                  id: activeLanguageCode,
                  languageCode: activeLanguageCode,
                  languageName: langObj?.name || activeLanguageCode,
                  entryCount: 0,
                  entries: [],
                },
              );
            }
            return;
          }

          const summaries = await localStore.listPhrasebookCollections(searchQuery);

          if (!cancelled) {
            setCollections(summaries);
          }
        } else {
          if (!cancelled) {
            setCollections([]);
            setCollectionDetail(null);
          }
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message || "Failed to load phrasebook.");

          if (activeLanguageCode) {
            setCollectionDetail(null);
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadCollections();

    return () => {
      cancelled = true;
    };
  }, [
    activeLanguageCode,
    authFetch,
    availableLanguages,
    isSignedIn,
    localStore,
    refreshNonce,
    searchQuery,
  ]);

  const resetComposer = () => {
    setComposerError("");
    setLanguageSearchQuery("");
    setSelectedLanguageCode(activeLanguageCode ?? theirLang.code);
    setSourceText("");
    setIsManualMode(false);
    setManualPhraseText("");
    setManualPhrasePronunciation("");
    setManualMeaningText("");
    setManualMeaningPronunciation("");
    setManualNoteText("");
  };

  const openComposer = () => {
    resetComposer();
    setIsComposerOpen(true);
  };

  const closeComposer = () => {
    setIsComposerOpen(false);
    setComposerError("");
  };

  const handleSaveComposer = async () => {
    try {
      setIsSaving(true);
      setComposerError("");

      let newEntryId = null;
      let finalTargetLanguageCode = selectedLanguageCode;

      if (isManualMode) {
        const validated = validatePhrasebookEditorInput(
          {
            targetLanguageCode: selectedLanguageCode,
            sourceLanguageCode: myLang.code,
            phraseText: manualPhraseText,
            phrasePronunciation: manualPhrasePronunciation,
            meaningText: manualMeaningText,
            meaningPronunciation: manualMeaningPronunciation,
            noteText: manualNoteText,
          },
          { requireMeaning: isSignedIn },
        );

        if (!isSignedIn && localStore) {
          const res = await localStore.createPhrasebookEntry(
            validated,
            { allowOptionalMeaning: true },
          );
          newEntryId = res.entry.id;
          finalTargetLanguageCode = res.entry.targetLanguageCode;
        } else if (isSignedIn) {
          const res = await saveCollectionEntry(authFetch, {
            sourceType: "manual",
            languageCode: validated.targetLanguageCode,
            phraseText: validated.phraseText,
            phrasePronunciation: validated.phrasePronunciation || "",
            meaningText: validated.meaningText,
            meaningPronunciation: validated.meaningPronunciation || "",
            noteText: validated.noteText || "",
            sourceLanguageCode: validated.sourceLanguageCode,
          });
          newEntryId = res.entry.id;
          finalTargetLanguageCode = res.collection.languageCode;
        }
      } else {
        // Quick add: single text input auto-translate
        const trimmedSourceText = sourceText.trim();
        if (!trimmedSourceText) {
          throw new Error("Enter a word or phrase first.");
        }

        const targetLanguage =
          availableLanguages.find((language) => language.code === selectedLanguageCode) ??
          theirLang;
        const translation = await translateTextMessage({
          text: trimmedSourceText,
          sourceLanguage: myLang,
          targetLanguage,
        });

        if (!isSignedIn && localStore) {
          const res = await localStore.createPhrasebookEntry(
            {
              targetLanguageCode: selectedLanguageCode,
              sourceLanguageCode: myLang.code,
              phraseText: translation.translatedText,
              phrasePronunciation: translation.translatedPronunciation || "",
              meaningText: translation.originalText,
              meaningPronunciation: translation.originalPronunciation || "",
              noteText: "",
            },
            { allowOptionalMeaning: true },
          );
          newEntryId = res.entry.id;
          finalTargetLanguageCode = res.entry.targetLanguageCode;
        } else if (isSignedIn) {
          const res = await saveCollectionEntry(authFetch, {
            sourceType: "manual",
            languageCode: selectedLanguageCode,
            phraseText: translation.translatedText,
            phrasePronunciation: translation.translatedPronunciation || "",
            meaningText: translation.originalText,
            meaningPronunciation: translation.originalPronunciation || "",
            sourceLanguageCode: myLang.code,
          });
          newEntryId = res.entry.id;
          finalTargetLanguageCode = res.collection.languageCode;
        }
      }

      closeComposer();
      setRefreshNonce((currentValue) => currentValue + 1);
      onPhrasebookChanged?.();

      if (newEntryId) {
        setActiveViewerEntryId(newEntryId);
      }

      if (!activeLanguageCode && finalTargetLanguageCode) {
        onSelectLanguageCode?.(finalTargetLanguageCode);
      }
    } catch (saveError) {
      setComposerError(saveError.message || "Could not save this card.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleArchiveEntry = async (entryId) => {
    try {
      if (!isSignedIn) {
        if (typeof window !== "undefined" && typeof window.confirm === "function") {
          const confirmed = window.confirm("Are you sure you want to delete this card?");
          if (!confirmed) return;
        }
        setArchivingEntryId(entryId);
        setError("");
        if (localStore) {
          await localStore.deletePhrasebookEntry(entryId);
        }
      } else {
        setArchivingEntryId(entryId);
        setError("");
        await archiveCollectionEntry(authFetch, entryId);
      }

      setCollectionDetail((currentDetail) => {
        if (!currentDetail) {
          return currentDetail;
        }

        const nextEntries = currentDetail.entries.filter((entry) => entry.id !== entryId);
        return {
          ...currentDetail,
          entryCount: nextEntries.length,
          entries: nextEntries,
        };
      });
      setRefreshNonce((currentValue) => currentValue + 1);
      onPhrasebookChanged?.();
    } catch (archiveError) {
      setError(archiveError.message || "Could not delete this card.");
    } finally {
      setArchivingEntryId(null);
    }
  };

  const handleEditEntry = (entry) => {
    setEditingEntry(entry);
    setEditorError("");
    setIsEditorModalOpen(true);
  };

  const handleSaveEditorModal = async (payload) => {
    try {
      setIsEditorSaving(true);
      setEditorError("");

      if (!isSignedIn && localStore) {
        await localStore.updatePhrasebookEntry(
          editingEntry.id,
          payload,
          { allowOptionalMeaning: true },
        );
        setIsEditorModalOpen(false);
        setEditingEntry(null);
        setRefreshNonce((v) => v + 1);
        onPhrasebookChanged?.();

        if (activeLanguageCode && payload.targetLanguageCode !== activeLanguageCode) {
          onSelectLanguageCode?.(payload.targetLanguageCode);
        }
      } else if (isSignedIn) {
        await updateCollectionEntry(authFetch, {
          entryId: editingEntry.id,
          ...payload,
        });
        setIsEditorModalOpen(false);
        setEditingEntry(null);
        setRefreshNonce((v) => v + 1);
        onPhrasebookChanged?.();

        if (activeLanguageCode && payload.targetLanguageCode !== activeLanguageCode) {
          onSelectLanguageCode?.(payload.targetLanguageCode);
        }
      }
    } catch (err) {
      setEditorError(err.message || "Failed to update card.");
    } finally {
      setIsEditorSaving(false);
    }
  };

  return (
    <>
      {activeLanguageCode && collectionDetail ? (
        <CollectionDetailView
          collection={collectionDetail}
          loading={loading}
          error={error}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          onBack={() => {
            setActiveViewerEntryId(null);
            onSelectLanguageCode?.(null);
          }}
          onOpenSidebar={onOpenSidebar}
          onOpenComposer={openComposer}
          onEditEntry={handleEditEntry}
          onArchiveEntry={handleArchiveEntry}
          archivingEntryId={archivingEntryId}
          activeViewerEntryId={activeViewerEntryId}
          onActiveViewerEntryIdChange={setActiveViewerEntryId}
          authFetch={authFetch}
          isSignedIn={isSignedIn}
          localStore={localStore}
          ttsVoice={ttsVoice}
          stopAllPlayback={stopAllPlayback}
          onAudioPlay={onAudioPlay}
          onPlayGeneratedSpeech={onPlayGeneratedSpeech}
          uiStrings={uiStrings}
        />
      ) : (
        <CollectionRootView
          collections={collections}
          loading={loading}
          error={error}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          onOpenSidebar={onOpenSidebar}
          onOpenComposer={openComposer}
          onSelectCollection={onSelectLanguageCode}
        />
      )}

      {isComposerOpen ? (
        <div className="pointer-events-none fixed inset-0 z-[70] flex items-end justify-center p-4 sm:items-center">
          <div className="pointer-events-auto w-full max-w-xl">
            <CollectionComposer
              availableLanguages={availableLanguages}
              selectedLanguageCode={selectedLanguageCode}
              sourceLanguageCode={myLang?.code || "en"}
              languageSearchQuery={languageSearchQuery}
              onLanguageSearchQueryChange={setLanguageSearchQuery}
              onSelectLanguageCode={setSelectedLanguageCode}
              allowLanguageSelection={!activeLanguageCode}
              sourceText={sourceText}
              onSourceTextChange={setSourceText}
              isManualMode={isManualMode}
              onToggleManualMode={() => setIsManualMode((v) => !v)}
              manualPhraseText={manualPhraseText}
              onManualPhraseTextChange={setManualPhraseText}
              manualPhrasePronunciation={manualPhrasePronunciation}
              onManualPhrasePronunciationChange={setManualPhrasePronunciation}
              manualMeaningText={manualMeaningText}
              onManualMeaningTextChange={setManualMeaningText}
              manualMeaningPronunciation={manualMeaningPronunciation}
              onManualMeaningPronunciationChange={setManualMeaningPronunciation}
              manualNoteText={manualNoteText}
              onManualNoteTextChange={setManualNoteText}
              requireMeaning={isSignedIn}
              onCancel={closeComposer}
              onSave={handleSaveComposer}
              isSaving={isSaving}
              error={composerError}
            />
          </div>
        </div>
      ) : null}

      <PhraseEditorModal
        isOpen={isEditorModalOpen}
        entry={editingEntry}
        availableLanguages={availableLanguages}
        requireMeaning={isSignedIn}
        isSaving={isEditorSaving}
        error={editorError}
        onClose={() => {
          setIsEditorModalOpen(false);
          setEditingEntry(null);
        }}
        onSave={handleSaveEditorModal}
      />
    </>
  );
}
