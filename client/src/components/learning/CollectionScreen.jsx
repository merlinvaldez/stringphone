import React, { useEffect, useMemo, useState } from "react";
import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  Loader2,
  Menu,
  MessageSquare,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import {
  archiveCollectionEntry,
  fetchCollection,
  fetchCollections,
  saveCollectionEntry,
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
            Collections
          </p>
        </div>

        <p className="mt-6 text-sm leading-7 text-zinc-300">
          Sign in to save phrases, search your collections, and reopen them by language.
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
  phraseText,
  onPhraseTextChange,
  phrasePronunciation,
  onPhrasePronunciationChange,
  meaningText,
  onMeaningTextChange,
  noteText,
  onNoteTextChange,
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
          className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-white/10 hover:text-white"
        >
          Close
        </button>
      </div>

      {allowLanguageSelection ? (
        <div className="mt-4 space-y-3">
          <SearchField
            value={languageSearchQuery}
            onChange={onLanguageSearchQueryChange}
            placeholder="Search collection language"
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
          value={phraseText}
          onChange={(event) => onPhraseTextChange(event.target.value)}
          placeholder="Target-language phrase"
          className="h-12 rounded-2xl border border-white/10 bg-black/20 px-4 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-emerald-400/40"
        />
        <input
          value={phrasePronunciation}
          onChange={(event) => onPhrasePronunciationChange(event.target.value)}
          placeholder="Pronunciation"
          className="h-12 rounded-2xl border border-white/10 bg-black/20 px-4 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-emerald-400/40"
        />
        <input
          value={meaningText}
          onChange={(event) => onMeaningTextChange(event.target.value)}
          placeholder="Meaning"
          className="h-12 rounded-2xl border border-white/10 bg-black/20 px-4 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-emerald-400/40"
        />
        <textarea
          value={noteText}
          onChange={(event) => onNoteTextChange(event.target.value)}
          placeholder="Note"
          rows={3}
          className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-emerald-400/40"
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
          {isSaving ? "Saving..." : "Save card"}
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
                  Collections
                </p>
              </div>
              <p className="mt-4 text-sm leading-6 text-zinc-300">
                Save phrases by language, reopen them fast, and add new cards without leaving Learning.
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenComposer}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-zinc-200 transition hover:bg-white/[0.08]"
              title="Add collection card"
              aria-label="Add collection card"
            >
              <Plus size={18} />
            </button>
          </div>

          <div className="mt-5">
            <SearchField
              value={searchQuery}
              onChange={onSearchQueryChange}
              placeholder="Search collections"
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
              No collection cards yet.
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
  onPlayGeneratedSpeech,
  uiStrings,
}) {
  return (
    <div className="mx-auto flex h-full w-full max-w-4xl flex-col overflow-y-auto px-4 pb-8 pt-28 sm:px-6 sm:pt-32">
      <div className="mx-auto mb-4 flex w-full max-w-3xl items-center justify-between gap-3">
        <HistoryShortcutButton onClick={onOpenSidebar} />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-300 transition hover:bg-white/10 hover:text-white"
            title="Back to collections"
            aria-label="Back to collections"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            onClick={onOpenComposer}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-300 transition hover:bg-white/10 hover:text-white"
            title="Add collection card"
            aria-label="Add collection card"
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
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300/80">
                Language collection
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
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
              No cards in this collection yet.
            </div>
          ) : (
            collection.entries.map((entry) => {
              const isArchiving = archivingEntryId === entry.id;

              return (
                <div
                  key={entry.id}
                  className="rounded-[1.75rem] border border-white/10 bg-zinc-900/70 p-5 shadow-xl backdrop-blur-xl"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
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
                        <TextToSpeechButton
                          text={entry.phraseText}
                          languageCode={entry.targetLanguageCode}
                          onPlay={onPlayGeneratedSpeech}
                          uiStrings={uiStrings}
                          className="mt-0.5"
                        />
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
                    <button
                      type="button"
                      onClick={() => void onArchiveEntry(entry.id)}
                      disabled={isArchiving}
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-rose-500/20 bg-rose-500/10 text-rose-300 transition hover:bg-rose-500/15 hover:text-rose-200 disabled:cursor-wait disabled:opacity-60"
                      title="Archive card"
                      aria-label="Archive card"
                    >
                      {isArchiving ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Trash2 size={14} />
                      )}
                    </button>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/10 pt-3 text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">
                    <div className="flex items-center gap-2">
                      {entry.sourceType === "message" ? (
                        <MessageSquare size={12} />
                      ) : (
                        <Plus size={12} />
                      )}
                      <span>{entry.sourceType === "message" ? "Saved from chat" : "Added here"}</span>
                    </div>
                    <span>{new Date(entry.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              );
            })
          )}
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
  const [phraseText, setPhraseText] = useState("");
  const [phrasePronunciation, setPhrasePronunciation] = useState("");
  const [meaningText, setMeaningText] = useState("");
  const [noteText, setNoteText] = useState("");
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
    setPhraseText("");
    setPhrasePronunciation("");
    setMeaningText("");
    setNoteText("");
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
      const result = await saveCollectionEntry(authFetch, {
        sourceType: "manual",
        languageCode: selectedLanguageCode,
        phraseText,
        phrasePronunciation,
        meaningText,
        noteText,
        sourceLanguageCode: myLang.code,
      });

      closeComposer();

      if (!activeLanguageCode) {
        onSelectLanguageCode?.(result.collection.languageCode);
      } else {
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
          onBack={() => onSelectLanguageCode?.(null)}
          onOpenSidebar={onOpenSidebar}
          onOpenComposer={openComposer}
          onArchiveEntry={handleArchiveEntry}
          archivingEntryId={archivingEntryId}
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
              phraseText={phraseText}
              onPhraseTextChange={setPhraseText}
              phrasePronunciation={phrasePronunciation}
              onPhrasePronunciationChange={setPhrasePronunciation}
              meaningText={meaningText}
              onMeaningTextChange={setMeaningText}
              noteText={noteText}
              onNoteTextChange={setNoteText}
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
