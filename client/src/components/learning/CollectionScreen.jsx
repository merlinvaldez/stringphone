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
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  archiveCollectionEntry,
  fetchCollection,
  fetchCollections,
  saveCollectionEntry,
  translateTextMessage,
} from "../../chatApi.js";
import { LanguageFlag, getFlagCountryCode } from "../../languageFlags.jsx";
import { useUiStrings } from "../../uiStrings.js";
import { formatPronunciationGuide } from "../../utils.js";
import { TextToSpeechButton } from "../audio/TextToSpeechButton.jsx";

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

function SignInCallout({ onOpenSidebar, onRequireSignIn }) {
  return (
    <div className="mx-auto flex h-full w-full max-w-4xl flex-col overflow-y-auto px-4 pb-8 pt-28 sm:px-6 sm:pt-32">
      <div className="mx-auto mb-4 flex w-full max-w-2xl justify-start">
        <HistoryShortcutButton onClick={onOpenSidebar} />
      </div>
      <div className="mx-auto w-full max-w-2xl rounded-[2rem] border border-white/10 bg-zinc-900/70 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
        <div className="inline-flex items-center gap-3 rounded-[1.5rem] border border-emerald-300/16 bg-[linear-gradient(135deg,rgba(16,185,129,0.12),rgba(24,24,27,0.88))] px-3.5 py-3 shadow-[0_18px_40px_rgba(0,0,0,0.22)] ring-1 ring-inset ring-white/5">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[1rem] border border-emerald-300/20 bg-emerald-400/[0.12] text-emerald-100 shadow-[0_0_24px_rgba(16,185,129,0.10)]">
                  <Bookmark size={20} />
                </span>
                <p className="pr-1 text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-emerald-100/90">
                  Phrasebook
                </p>
              </div>

        <p className="mt-6 text-sm leading-7 text-zinc-300">
          Sign in to save phrases, search your phrasebook, and reopen it by language.
        </p>

        <button
          type="button"
          onClick={onRequireSignIn}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-300"
        >
          <GraduationCap size={16} />
          Sign in
        </button>
      </div>
    </div>
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
  languageSearchQuery,
  onLanguageSearchQueryChange,
  onSelectLanguageCode,
  allowLanguageSelection,
  sourceText,
  onSourceTextChange,
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

  return (
    <div className="rounded-[1.75rem] border border-white/10 bg-zinc-900/85 p-4 shadow-xl backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-300">
          <Plus size={13} />
          New card
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
          <div className="max-h-40 overflow-y-auto rounded-2xl border border-white/10 bg-black/20 p-1.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {filteredLanguages.map((language) => (
              <button
                key={language.code}
                type="button"
                onClick={() => onSelectLanguageCode(language.code)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${
                  selectedLanguageCode === language.code
                    ? "bg-white/10 text-white"
                    : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                }`}
              >
                <LanguageFlag
                  countryCode={language.flag}
                  label={language.name}
                  className="h-4 w-6"
                />
                <span className="truncate">{language.name}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

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
          className="h-12 rounded-2xl border border-white/10 bg-black/20 px-4 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-emerald-400/40"
        />
      </div>

      {error ? (
        <p className="mt-4 rounded-xl border border-rose-400/15 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      ) : null}

      <div className="mt-5 flex justify-end">
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={isSaving}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSaving ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Bookmark size={16} />
          )}
          {isSaving ? "Translating..." : "Save"}
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
                key={collection.id}
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
                    {collection.entryCount} {collection.entryCount === 1 ? "card" : "cards"}
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
  onArchiveEntry,
  archivingEntryId,
  activeViewerEntryId,
  onActiveViewerEntryIdChange,
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
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-300 transition hover:bg-white/10 hover:text-white"
              title="Back to phrasebook"
              aria-label="Back to phrasebook"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              onClick={onOpenComposer}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-300 transition hover:bg-white/10 hover:text-white"
              title="Add phrasebook card"
              aria-label="Add phrasebook card"
            >
              <Plus size={18} />
            </button>
          </div>
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
                  {collection.entryCount} {collection.entryCount === 1 ? "card" : "cards"}
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
                              onPlay={onPlayGeneratedSpeech}
                              uiStrings={uiStrings}
                              className="mt-0.5"
                            />
                          </div>
                        </div>
                        <p className="mt-3 text-sm leading-6 text-zinc-300">
                          {entry.meaningText}
                        </p>
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
                          aria-label="Archive card"
                          title="Archive card"
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
          onClose={() => onActiveViewerEntryIdChange(null)}
          onSelectIndex={(nextIndex) =>
            onActiveViewerEntryIdChange(
              collection.entries[nextIndex]?.id ?? null,
            )
          }
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
  onPlayGeneratedSpeech,
  uiStrings,
}) {
  const touchStartXRef = useRef(null);
  const touchStartYRef = useRef(null);
  const touchCurrentXRef = useRef(null);
  const touchCurrentYRef = useRef(null);
  const [displayedIndex, setDisplayedIndex] = useState(activeEntryIndex);
  const [dragOffsetX, setDragOffsetX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isTrackTransitioning, setIsTrackTransitioning] = useState(false);
  const [trackOffsetPercent, setTrackOffsetPercent] = useState(-100);
  const [pendingIndex, setPendingIndex] = useState(null);
  const entry = entries[displayedIndex] ?? null;
  const previousEntry = displayedIndex > 0 ? entries[displayedIndex - 1] : null;
  const nextEntry =
    displayedIndex < entries.length - 1 ? entries[displayedIndex + 1] : null;
  const hasPrevious = displayedIndex > 0;
  const hasNext = displayedIndex < entries.length - 1;
  const hasRandomAlternative = entries.length > 1;

  useEffect(() => {
    if (!isTrackTransitioning && activeEntryIndex !== displayedIndex) {
      setDisplayedIndex(activeEntryIndex);
      setTrackOffsetPercent(-100);
      setDragOffsetX(0);
    }
  }, [activeEntryIndex, displayedIndex, isTrackTransitioning]);

  useEffect(() => {
    if (!entry) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }

      if (event.key === "ArrowLeft" && hasPrevious) {
        triggerSlideNavigation(-1);
        return;
      }

      if (event.key === "ArrowRight" && hasNext) {
        triggerSlideNavigation(1);
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [entry, hasNext, hasPrevious, onClose]);

  if (!entry) {
    return null;
  }

  const triggerSlideNavigation = (direction) => {
    if (isTrackTransitioning || isDragging) {
      return;
    }

    const nextIndex = displayedIndex + direction;

    if (nextIndex < 0 || nextIndex >= entries.length) {
      return;
    }

    setPendingIndex(nextIndex);
    setIsTrackTransitioning(true);
    setTrackOffsetPercent(direction > 0 ? -200 : 0);
    setDragOffsetX(0);
  };

  const handleTouchStart = (event) => {
    touchStartXRef.current = event.touches[0]?.clientX ?? null;
    touchStartYRef.current = event.touches[0]?.clientY ?? null;
    touchCurrentXRef.current = touchStartXRef.current;
    touchCurrentYRef.current = touchStartYRef.current;
    setIsDragging(false);
  };

  const handleTouchMove = (event) => {
    if (isTrackTransitioning) {
      return;
    }

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

    const clampedDeltaX = Math.max(Math.min(deltaX, 180), -180);
    setIsDragging(true);
    setDragOffsetX(clampedDeltaX);
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

    if (deltaX >= threshold && hasPrevious) {
      setIsDragging(false);
      triggerSlideNavigation(-1);
      return;
    }

    if (deltaX <= -threshold && hasNext) {
      setIsDragging(false);
      triggerSlideNavigation(1);
      return;
    }

    if (isDragging) {
      setIsDragging(false);
      setIsTrackTransitioning(true);
      setTrackOffsetPercent(-100);
      setDragOffsetX(0);
    }
  };

  const handleSelectRandomEntry = () => {
    if (!hasRandomAlternative || isTrackTransitioning || isDragging) {
      return;
    }

    let nextIndex = displayedIndex;

    while (nextIndex === activeEntryIndex) {
      nextIndex = Math.floor(Math.random() * entries.length);
    }

    setDisplayedIndex(nextIndex);
    setTrackOffsetPercent(-100);
    setDragOffsetX(0);
    onSelectIndex(nextIndex);
  };

  const handleTrackTransitionEnd = () => {
    if (!isTrackTransitioning) {
      return;
    }

    if (pendingIndex == null) {
      setIsTrackTransitioning(false);
      setTrackOffsetPercent(-100);
      setDragOffsetX(0);
      return;
    }

    setDisplayedIndex(pendingIndex);
    setIsTrackTransitioning(false);
    setTrackOffsetPercent(-100);
    setDragOffsetX(0);
    onSelectIndex(pendingIndex);
    setPendingIndex(null);
  };

  const viewerTrackTransform =
    isDragging || dragOffsetX !== 0
      ? `translateX(calc(${trackOffsetPercent}% + ${dragOffsetX}px))`
      : `translateX(${trackOffsetPercent}%)`;

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="mx-auto flex h-full max-w-5xl items-center justify-center p-4 sm:p-6">
        <div
          className="w-full max-w-3xl rounded-[2.25rem] border border-white/10 bg-zinc-900/90 p-5 shadow-2xl backdrop-blur-xl sm:p-8"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-300 transition hover:bg-white/10 hover:text-white"
              aria-label="Close card viewer"
              title="Close card viewer"
            >
              <X size={18} />
            </button>
          </div>

          <div className="relative mt-3 min-h-[min(70vh,40rem)]">
            <button
              type="button"
              onClick={() => triggerSlideNavigation(-1)}
              disabled={!hasPrevious || isTrackTransitioning}
              className={`absolute left-0 top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-300 transition hover:bg-white/10 hover:text-white ${
                !hasPrevious || isTrackTransitioning
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
              onClick={() => triggerSlideNavigation(1)}
              disabled={!hasNext || isTrackTransitioning}
              className={`absolute right-0 top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-300 transition hover:bg-white/10 hover:text-white ${
                !hasNext || isTrackTransitioning
                  ? "cursor-default opacity-30 hover:bg-white/5 hover:text-zinc-300"
                  : ""
              }`}
              aria-label="Next card"
              title="Next card"
            >
              <ChevronRight size={20} />
            </button>

            <div
              className="overflow-hidden px-12 sm:px-16"
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              <div
                className="flex"
                style={{
                  transform: viewerTrackTransform,
                  transition:
                    isTrackTransitioning && !isDragging
                      ? "transform 260ms cubic-bezier(0.22, 1, 0.36, 1)"
                      : "none",
                }}
                onTransitionEnd={handleTrackTransitionEnd}
              >
                {[previousEntry, entry, nextEntry].map((slideEntry, slideIndex) => (
                  <div
                    key={slideEntry?.id ?? `slide-${slideIndex}`}
                    className="flex w-full shrink-0 justify-center"
                  >
                    <div className="flex min-h-[min(62vh,34rem)] w-full max-w-2xl flex-col items-center justify-center text-center">
                      {slideEntry ? (
                        <>
                          <div className="flex max-w-full items-center justify-center gap-3">
                            <p className="text-3xl font-semibold leading-tight tracking-tight text-white sm:text-5xl">
                              {slideEntry.phraseText}
                            </p>
                            <TextToSpeechButton
                              text={slideEntry.phraseText}
                              languageCode={slideEntry.targetLanguageCode}
                              onPlay={onPlayGeneratedSpeech}
                              uiStrings={uiStrings}
                              className="shrink-0"
                            />
                          </div>
                          <PronunciationGuide
                            value={slideEntry.phrasePronunciation}
                            className="mt-4 text-base text-emerald-200/80 sm:text-lg"
                          />
                          <p className="mt-8 text-lg leading-8 text-zinc-200 sm:text-2xl sm:leading-10">
                            {slideEntry.meaningText}
                          </p>
                          {slideEntry.noteText ? (
                            <p className="mt-6 max-w-2xl text-sm leading-7 text-zinc-500 sm:text-base">
                              {slideEntry.noteText}
                            </p>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="absolute bottom-0 left-1/2 -translate-x-1/2">
              <button
                type="button"
                onClick={handleSelectRandomEntry}
                disabled={!hasRandomAlternative || isTrackTransitioning}
                className={`inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-300 transition hover:bg-white/10 hover:text-white ${
                  !hasRandomAlternative || isTrackTransitioning
                    ? "cursor-default opacity-30 hover:bg-white/5 hover:text-zinc-300"
                    : ""
                }`}
                aria-label="Random card"
                title="Random card"
              >
                <Dices size={18} />
              </button>
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
  availableLanguages,
  activeLanguageCode,
  onSelectLanguageCode,
  onOpenSidebar,
  onRequireSignIn,
  onPlayGeneratedSpeech,
}) {
  const [collections, setCollections] = useState([]);
  const [collectionDetail, setCollectionDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [composerError, setComposerError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [languageSearchQuery, setLanguageSearchQuery] = useState("");
  const [selectedLanguageCode, setSelectedLanguageCode] = useState(
    activeLanguageCode ?? theirLang.code,
  );
  const [sourceText, setSourceText] = useState("");
  const [activeViewerEntryId, setActiveViewerEntryId] = useState(null);
  const [archivingEntryId, setArchivingEntryId] = useState(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
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
    if (!isSignedIn) {
      setCollections([]);
      setCollectionDetail(null);
      setLoading(false);
      setError("");
      return;
    }

    let cancelled = false;

    const loadCollections = async () => {
      try {
        setLoading(true);
        setError("");

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
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message || "Failed to load collections.");

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
  }, [activeLanguageCode, authFetch, isSignedIn, refreshNonce, searchQuery]);

  const resetComposer = () => {
    setComposerError("");
    setLanguageSearchQuery("");
    setSelectedLanguageCode(activeLanguageCode ?? theirLang.code);
    setSourceText("");
  };

  const openComposer = () => {
    resetComposer();
    setIsComposerOpen(true);
  };

  const closeComposer = () => {
    setIsComposerOpen(false);
    setComposerError("");
  };

  const handleSaveManualCard = async () => {
    if (!isSignedIn) {
      onRequireSignIn?.();
      return;
    }

    try {
      setIsSaving(true);
      setComposerError("");
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
      const result = await saveCollectionEntry(authFetch, {
        sourceType: "manual",
        languageCode: selectedLanguageCode,
        phraseText: translation.translatedText,
        phrasePronunciation: translation.translatedPronunciation ?? "",
        meaningText: translation.originalText,
        meaningPronunciation: translation.originalPronunciation ?? "",
        sourceLanguageCode: myLang.code,
      });

      setActiveViewerEntryId(result.entry.id);
      closeComposer();

      if (!activeLanguageCode) {
        onSelectLanguageCode?.(result.collection.languageCode);
      } else {
        setCollectionDetail((currentDetail) => {
          if (!currentDetail) {
            return currentDetail;
          }

          if (currentDetail.id !== result.collection.id) {
            return currentDetail;
          }

          const nextEntries = [
            result.entry,
            ...currentDetail.entries.filter(
              (entry) => entry.id !== result.entry.id,
            ),
          ];

          return {
            ...currentDetail,
            entryCount: nextEntries.length,
            entries: nextEntries,
          };
        });
        setRefreshNonce((currentValue) => currentValue + 1);
      }
    } catch (saveError) {
      setComposerError(saveError.message || "Could not save this card.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleArchiveEntry = async (entryId) => {
    try {
      setArchivingEntryId(entryId);
      setError("");
      await archiveCollectionEntry(authFetch, entryId);
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
    } catch (archiveError) {
      setError(archiveError.message || "Could not archive this card.");
    } finally {
      setArchivingEntryId(null);
    }
  };

  if (!isSignedIn) {
    return (
      <SignInCallout
        onOpenSidebar={onOpenSidebar}
        onRequireSignIn={onRequireSignIn}
      />
    );
  }

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
          onArchiveEntry={handleArchiveEntry}
          archivingEntryId={archivingEntryId}
          activeViewerEntryId={activeViewerEntryId}
          onActiveViewerEntryIdChange={setActiveViewerEntryId}
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
              languageSearchQuery={languageSearchQuery}
              onLanguageSearchQueryChange={setLanguageSearchQuery}
              onSelectLanguageCode={setSelectedLanguageCode}
              allowLanguageSelection={!activeLanguageCode}
              sourceText={sourceText}
              onSourceTextChange={setSourceText}
              onCancel={closeComposer}
              onSave={handleSaveManualCard}
              isSaving={isSaving}
              error={composerError}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
