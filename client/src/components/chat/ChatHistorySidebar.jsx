import React, { useEffect, useState } from "react";
import {
  Bookmark,
  X,
  Plus,
  Loader2,
  ArrowRight,
  GraduationCap,
  MessageSquare,
  MoreVertical,
  Search,
  Trash2,
} from "lucide-react";
import {
  archiveConversation,
  fetchCollections,
  archiveLesson,
  createConversation,
  fetchConversations,
  fetchLessons,
} from "../../chatApi.js";
import { useAppAuth } from "../../AuthContext.jsx";
import { getFlagCountryCode, LanguageFlag } from "../../languageFlags.jsx";
import { formatHistoryRowMeta } from "../../chatParityHelpers.js";

const SHOW_LESSON_HISTORY = false;

function getVisibleHistoryType(historyType) {
  return !SHOW_LESSON_HISTORY && historyType === "lessons"
    ? "collections"
    : historyType;
}

export function ChatHistorySidebar({
  isOpen,
  onClose,
  preferredHistoryType = "chats",
  signedOutContext = "standard",
  onRequireSignIn,
  currentConversationId,
  onSelectConversation,
  onNewConversation,
  onArchiveConversation,
  currentLessonId,
  onSelectLesson,
  onCreateLesson,
  onArchiveLesson,
  currentCollectionLanguageCode,
  onSelectCollection,
  onOpenCollections,
  currentSourceLanguage,
  currentTargetLanguage,
  localStore = null,
  currentOriginMode = "chat",
}) {
  const { authFetch, isSignedIn } = useAppAuth();
  const [conversations, setConversations] = useState([]);
  const [collections, setCollections] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [archivingConversationId, setArchivingConversationId] = useState(null);
  const [archivingLessonId, setArchivingLessonId] = useState(null);
  const [openConversationMenuId, setOpenConversationMenuId] = useState(null);
  const [openLessonMenuId, setOpenLessonMenuId] = useState(null);
  const [lessons, setLessons] = useState([]);
  const [historyType, setHistoryType] = useState(() =>
    getVisibleHistoryType(preferredHistoryType),
  );
  const [error, setError] = useState("");

  useEffect(() => {
    if (isOpen) {
      void loadHistory();
    }
  }, [historyType, isOpen, isSignedIn, query]);

  useEffect(() => {
    if (isOpen) {
      setHistoryType(getVisibleHistoryType(preferredHistoryType));
    } else {
      setQuery("");
    }
  }, [isOpen, preferredHistoryType]);

  useEffect(() => {
    if (!openConversationMenuId && !openLessonMenuId) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (
        event.target instanceof Element &&
        event.target.closest("[data-history-actions]")
      ) {
        return;
      }

      setOpenConversationMenuId(null);
      setOpenLessonMenuId(null);
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setOpenConversationMenuId(null);
        setOpenLessonMenuId(null);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [openConversationMenuId, openLessonMenuId]);

  const isBusy =
    loading ||
    archivingConversationId !== null ||
    archivingLessonId !== null;

  async function loadConversations() {
    try {
      setLoading(true);
      setError("");
      if (isSignedIn) {
        const data = await fetchConversations(authFetch);
        const q = query.trim().toLowerCase();
        if (q) {
          setConversations(
            data.filter(
              (c) =>
                (c.title || "").toLowerCase().includes(q) ||
                (c.source_language || "").toLowerCase().includes(q) ||
                (c.target_language || "").toLowerCase().includes(q),
            ),
          );
        } else {
          setConversations(data);
        }
      } else if (localStore) {
        const data = await localStore.listConversations(query);
        setConversations(data);
      } else {
        setConversations([]);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadLessons() {
    try {
      setLoading(true);
      setError("");
      if (isSignedIn) {
        setLessons(await fetchLessons(authFetch));
      } else {
        setLessons([]);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadCollections() {
    try {
      setLoading(true);
      setError("");
      if (isSignedIn) {
        const data = await fetchCollections(authFetch);
        const q = query.trim().toLowerCase();
        if (q) {
          setCollections(
            data.filter(
              (col) =>
                (col.languageName || "").toLowerCase().includes(q) ||
                (col.languageCode || "").toLowerCase().includes(q),
            ),
          );
        } else {
          setCollections(data);
        }
      } else if (localStore) {
        const data = await localStore.listPhrasebookCollections(query);
        setCollections(data);
      } else {
        setCollections([]);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadHistory() {
    if (SHOW_LESSON_HISTORY && historyType === "lessons") {
      await loadLessons();
      return;
    }

    if (historyType === "collections") {
      await loadCollections();
      return;
    }

    await loadConversations();
  }

  async function handleNewConversation() {
    try {
      setLoading(true);
      setError("");
      const title = "New chat";
      if (isSignedIn) {
        const newConv = await createConversation(authFetch, {
          title,
          originMode: currentOriginMode,
          sourceLanguage: currentSourceLanguage?.code || currentSourceLanguage,
          targetLanguage: currentTargetLanguage?.code || currentTargetLanguage,
        });
        setConversations((previous) => [newConv, ...previous]);
        await onNewConversation(newConv);
      } else if (localStore) {
        const newConv = await localStore.createConversation({
          originMode: currentOriginMode,
          myLanguageCode:
            currentSourceLanguage?.code || currentSourceLanguage || "en",
          theirLanguageCode:
            currentTargetLanguage?.code || currentTargetLanguage || "es",
        });
        await localStore.setActiveConversationId(newConv.id);
        setConversations((previous) => [newConv, ...previous]);
        await onNewConversation(newConv);
      }
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSelectConversation(conversation) {
    try {
      setLoading(true);
      setError("");
      setOpenConversationMenuId(null);
      await onSelectConversation(conversation);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleSelectLesson(lesson) {
    setOpenLessonMenuId(null);
    onSelectLesson?.(lesson);
    onClose();
  }

  function handleCreateLesson() {
    onCreateLesson?.();
    onClose();
  }

  function handleOpenCollections() {
    onOpenCollections?.();
    onClose();
  }

  async function handleArchiveConversation(conversationId) {
    if (!isSignedIn) {
      const confirmed = window.confirm(
        "Permanently delete this conversation and its recorded audio?",
      );
      if (!confirmed) {
        return;
      }
    }
    try {
      setArchivingConversationId(conversationId);
      setError("");
      setOpenConversationMenuId(null);
      if (isSignedIn) {
        await archiveConversation(authFetch, conversationId);
      } else if (localStore) {
        await localStore.deleteConversation(conversationId);
      }
      await Promise.resolve(onArchiveConversation?.(conversationId));
      setConversations((previous) =>
        previous.filter((conversation) => conversation.id !== conversationId),
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setArchivingConversationId(null);
    }
  }

  async function handleArchiveLesson(lessonId) {
    try {
      setArchivingLessonId(lessonId);
      setError("");
      setOpenLessonMenuId(null);
      await archiveLesson(authFetch, lessonId);
      await Promise.resolve(onArchiveLesson?.(lessonId));
      setLessons((previous) => previous.filter((lesson) => lesson.id !== lessonId));
    } catch (err) {
      setError(err.message);
    } finally {
      setArchivingLessonId(null);
    }
  }

  function getDisplayTitle(conversation) {
    const rawTitle = conversation.title ?? "";
    const title = rawTitle
      .replace(/^[A-Z]{2}\s*(?:->|\u2192)\s*[A-Z]{2}\s+/i, "")
      .trim();

    return title || "New chat";
  }

  function renderConversationFlags(conversation) {
    const sourceLang =
      conversation.source_language || conversation.myLanguageCode || "en";
    const targetLang =
      conversation.target_language || conversation.theirLanguageCode || "es";
    const sourceCountryCode = getFlagCountryCode(sourceLang);
    const targetCountryCode = getFlagCountryCode(targetLang);

    return (
      <div className="mt-0.5 flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1">
        <LanguageFlag
          countryCode={sourceCountryCode}
          label={sourceLang}
          className="h-4 w-5"
        />
        <ArrowRight
          aria-hidden="true"
          className="h-2 w-2 shrink-0 text-zinc-500"
          strokeWidth={2.25}
        />
        <LanguageFlag
          countryCode={targetCountryCode}
          label={targetLang}
          className="h-4 w-5"
        />
      </div>
    );
  }

  function getLessonTitle(lesson) {
    const historyTitle =
      lesson.content?.historyTitle ||
      lesson.content?.summary ||
      lesson.topic ||
      lesson.content?.title ||
      "New lesson";

    return typeof historyTitle === "string" ? historyTitle.trim() : "New lesson";
  }

  function getLessonTargetCountryCode(lesson) {
    const targetLanguageCode =
      lesson.target_language ||
      lesson.targetLanguage ||
      lesson.targetLanguageCode ||
      currentTargetLanguage?.code ||
      "";

    return getFlagCountryCode(targetLanguageCode);
  }

  if (!isOpen) return null;

  const actionButton =
    historyType === "chats" ? (
      <button
        onClick={handleNewConversation}
        disabled={isBusy}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 font-medium text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
        New Conversation
      </button>
    ) : historyType === "collections" || !SHOW_LESSON_HISTORY ? (
      <button
        onClick={handleOpenCollections}
        disabled={isBusy}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 font-medium text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Bookmark size={18} />
        Open phrasebook
      </button>
    ) : (
      <button
        onClick={handleCreateLesson}
        disabled={isBusy}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 font-medium text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <GraduationCap size={18} />
        New lesson
      </button>
    );

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      <div className="fixed inset-y-0 left-0 z-50 flex w-80 animate-in slide-in-from-left flex-col border-r border-white/10 bg-zinc-900 shadow-2xl duration-300">
        <div className="border-b border-white/10 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">History</h2>
            <button
              onClick={onClose}
              className="rounded-full p-2 text-zinc-400 transition hover:bg-white/10 hover:text-white"
              aria-label="Close history"
              title="Close history"
            >
              <X size={20} />
            </button>
          </div>
          <div
            role="tablist"
            aria-label="History type"
            className="mt-3 inline-flex rounded-xl border border-white/10 bg-black/20 p-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={historyType === "chats"}
              onClick={() => setHistoryType("chats")}
              className={`flex h-8 w-9 items-center justify-center rounded-lg transition ${
                historyType === "chats"
                  ? "bg-white/10 text-white"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
              aria-label="Chat history"
              title="Chat history"
            >
              <MessageSquare size={15} />
            </button>
            {SHOW_LESSON_HISTORY ? (
              <button
                type="button"
                role="tab"
                aria-selected={historyType === "lessons"}
                onClick={() => setHistoryType("lessons")}
                className={`flex h-8 w-9 items-center justify-center rounded-lg transition ${
                  historyType === "lessons"
                    ? "bg-white/10 text-white"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
                aria-label="Lesson history"
                title="Lesson history"
              >
                <GraduationCap size={16} />
              </button>
            ) : null}
            <button
              type="button"
              role="tab"
              aria-selected={historyType === "collections"}
              onClick={() => setHistoryType("collections")}
              className={`flex h-8 w-9 items-center justify-center rounded-lg transition ${
                historyType === "collections"
                  ? "bg-white/10 text-white"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
              aria-label="Phrasebook history"
              title="Phrasebook history"
            >
              <Bookmark size={15} />
            </button>
          </div>
        </div>

        <div className="border-b border-white/10 p-4">
          {actionButton}
          <div className="relative mt-3">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                historyType === "collections"
                  ? "Search phrasebook"
                  : "Search titles or messages"
              }
              className="w-full rounded-xl border border-white/10 bg-black/25 py-2 pl-8 pr-8 text-xs text-zinc-200 placeholder:text-zinc-500 focus:border-emerald-500/40 focus:outline-none"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-zinc-400 hover:text-white"
                aria-label="Clear search"
              >
                <X size={12} />
              </button>
            ) : null}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {error && (
            <div className="mb-2 rounded-lg border border-rose-500/20 bg-rose-500/10 p-3 text-sm text-rose-400">
              {error}
            </div>
          )}

          {loading &&
            ((historyType === "chats" && conversations.length === 0) ||
              (historyType === "lessons" && lessons.length === 0) ||
              (historyType === "collections" && collections.length === 0)) && (
              <div className="flex justify-center p-8">
                <Loader2 size={24} className="animate-spin text-zinc-500" />
              </div>
            )}

          {!loading &&
            historyType === "chats" &&
            conversations.length === 0 &&
            !error && (
              <div className="p-8 text-center text-sm text-zinc-500">
                {query.trim()
                  ? "No conversations match your search."
                  : "No saved conversations yet."}
              </div>
            )}

          {!loading &&
            historyType === "lessons" &&
            lessons.length === 0 &&
            !error && (
              <div className="p-8 text-center text-sm text-zinc-500">
                {query.trim()
                  ? "No lessons match your search."
                  : "No saved lessons yet."}
              </div>
            )}

          {!loading &&
            historyType === "collections" &&
            collections.length === 0 &&
            !error && (
              <div className="p-8 text-center text-sm text-zinc-500">
                {query.trim()
                  ? "No phrasebook entries match your search."
                  : "No saved phrasebook entries yet."}
              </div>
            )}

          {historyType === "chats" &&
            conversations.map((conv) => {
              const isArchiving = archivingConversationId === conv.id;
              const isSelected = currentConversationId === conv.id;
              const isMenuOpen = openConversationMenuId === conv.id;

              return (
                <div
                  key={conv.id}
                  className={`mb-1 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1 rounded-xl transition ${
                    isSelected ? "bg-white/10" : "hover:bg-white/5"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      void handleSelectConversation(conv);
                    }}
                    disabled={isBusy}
                    className={`flex min-w-0 items-start gap-3 p-3 text-left transition ${
                      isSelected
                        ? "bg-white/10 text-white"
                        : "text-zinc-300 hover:bg-white/5"
                    } ${
                      isBusy ? "cursor-wait opacity-70" : ""
                    }`}
                  >
                    {renderConversationFlags(conv)}
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">
                        {getDisplayTitle(conv)}
                      </div>
                      <div className="mt-1 text-xs text-zinc-500">
                        {formatHistoryRowMeta(conv)}
                      </div>
                    </div>
                  </button>

                  <div data-history-actions className="mr-2 flex items-center gap-1">
                    <button
                      type="button"
                      aria-label="Archive conversation"
                      title="Archive conversation"
                      onClick={() => {
                        void handleArchiveConversation(conv.id);
                      }}
                      disabled={isBusy}
                      className={`flex items-center justify-center overflow-hidden rounded-lg border border-rose-500/20 bg-rose-500/10 text-rose-300 transition-all duration-200 hover:bg-rose-500/15 hover:text-rose-200 ${
                        isMenuOpen
                          ? "pointer-events-auto max-w-9 translate-x-0 p-2 opacity-100"
                          : "pointer-events-none max-w-0 translate-x-2 p-0 opacity-0"
                      } ${
                        isBusy ? "cursor-wait" : ""
                      }`}
                    >
                      {isArchiving ? (
                        <Loader2 size={12} className="shrink-0 animate-spin" />
                      ) : (
                        <Trash2 size={12} className="shrink-0" />
                      )}
                    </button>

                    <button
                      type="button"
                      aria-label="Conversation actions"
                      title="Conversation actions"
                      onClick={() => {
                        setOpenConversationMenuId((currentId) =>
                          currentId === conv.id ? null : conv.id,
                        );
                      }}
                      disabled={isBusy}
                      className={`rounded-lg p-2 text-zinc-500 transition hover:bg-white/10 hover:text-white focus-visible:bg-white/10 focus-visible:text-white ${
                        isBusy ? "cursor-wait" : ""
                      }`}
                    >
                      <MoreVertical size={15} />
                    </button>
                  </div>
                </div>
              );
            })}

          {historyType === "lessons" &&
            lessons.map((lesson) => {
              const isSelected = currentLessonId === lesson.id;
              const targetCountryCode = getLessonTargetCountryCode(lesson);
              const isArchiving = archivingLessonId === lesson.id;
              const isMenuOpen = openLessonMenuId === lesson.id;

              return (
                <div
                  key={lesson.id}
                  className={`mb-1 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1 rounded-xl transition ${
                    isSelected ? "bg-white/10" : "hover:bg-white/5"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => handleSelectLesson(lesson)}
                    disabled={isBusy}
                    className={`flex min-w-0 items-start gap-3 p-3 text-left transition ${
                      isSelected
                        ? "bg-white/10 text-white"
                        : "text-zinc-300 hover:bg-white/5"
                    } ${isBusy ? "cursor-wait opacity-70" : ""}`}
                  >
                    <LanguageFlag
                      countryCode={targetCountryCode}
                      label={
                        lesson.target_language ||
                        lesson.targetLanguage ||
                        lesson.targetLanguageCode ||
                        "Lesson language"
                      }
                      className="mt-1 h-5 w-7 shrink-0"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {getLessonTitle(lesson)}
                      </span>
                      <span className="mt-1 block text-xs text-zinc-500">
                        {new Date(lesson.created_at).toLocaleDateString()}
                      </span>
                    </span>
                  </button>

                  <div data-history-actions className="mr-2 flex items-center gap-1">
                    <button
                      type="button"
                      aria-label="Archive lesson"
                      title="Archive lesson"
                      onClick={() => {
                        void handleArchiveLesson(lesson.id);
                      }}
                      disabled={isBusy}
                      className={`flex items-center justify-center overflow-hidden rounded-lg border border-rose-500/20 bg-rose-500/10 text-rose-300 transition-all duration-200 hover:bg-rose-500/15 hover:text-rose-200 ${
                        isMenuOpen
                          ? "pointer-events-auto max-w-9 translate-x-0 p-2 opacity-100"
                          : "pointer-events-none max-w-0 translate-x-2 p-0 opacity-0"
                      } ${isBusy ? "cursor-wait" : ""}`}
                    >
                      {isArchiving ? (
                        <Loader2 size={12} className="shrink-0 animate-spin" />
                      ) : (
                        <Trash2 size={12} className="shrink-0" />
                      )}
                    </button>

                    <button
                      type="button"
                      aria-label="Lesson actions"
                      title="Lesson actions"
                      onClick={() => {
                        setOpenLessonMenuId((currentId) =>
                          currentId === lesson.id ? null : lesson.id,
                        );
                      }}
                      disabled={isBusy}
                      className={`rounded-lg p-2 text-zinc-500 transition hover:bg-white/10 hover:text-white focus-visible:bg-white/10 focus-visible:text-white ${
                        isBusy ? "cursor-wait" : ""
                      }`}
                    >
                      <MoreVertical size={15} />
                    </button>
                  </div>
                </div>
              );
            })}

          {historyType === "collections" &&
            collections.map((collection) => {
              const isSelected =
                currentCollectionLanguageCode === collection.languageCode;

              return (
                <button
                  key={collection.id || collection.languageCode}
                  type="button"
                  onClick={() => {
                    onSelectCollection?.(collection.languageCode);
                    onClose();
                  }}
                  disabled={isBusy}
                  className={`mb-1 flex w-full items-start gap-3 rounded-xl p-3 text-left transition ${
                    isSelected
                      ? "bg-white/10 text-white"
                      : "text-zinc-300 hover:bg-white/5"
                  } ${isBusy ? "cursor-wait opacity-70" : ""}`}
                >
                  <LanguageFlag
                    countryCode={getFlagCountryCode(collection.languageCode)}
                    label={collection.languageName}
                    className="mt-1 h-5 w-7 shrink-0"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {collection.languageName}
                    </span>
                    <span className="mt-1 block text-xs text-zinc-500">
                      {collection.entryCount}{" "}
                      {collection.entryCount === 1 ? "card" : "cards"}
                    </span>
                  </span>
                </button>
              );
            })}
        </div>
      </div>
    </>
  );
}
