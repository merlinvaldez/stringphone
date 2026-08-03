import React, { useEffect, useState } from "react";
import {
  Bookmark,
  X,
  Plus,
  Loader2,
  ArrowRight,
  GraduationCap,
  MessageSquare,
  Mic,
  MoreVertical,
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
}) {
  const { authFetch, isSignedIn } = useAppAuth();
  const [conversations, setConversations] = useState([]);
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(false);
  const [archivingConversationId, setArchivingConversationId] = useState(null);
  const [archivingLessonId, setArchivingLessonId] = useState(null);
  const [openConversationMenuId, setOpenConversationMenuId] = useState(null);
  const [openLessonMenuId, setOpenLessonMenuId] = useState(null);
  const [lessons, setLessons] = useState([]);
  const [historyType, setHistoryType] = useState(preferredHistoryType);
  const [error, setError] = useState("");
  const signedOutCallout =
    signedOutContext === "voice"
      ? {
          Icon: Mic,
          detail: "to save your voice",
        }
      : historyType === "lessons"
        ? {
            Icon: GraduationCap,
            detail: "to save your lessons",
          }
        : historyType === "collections"
          ? {
              Icon: Bookmark,
              detail: "to save your collections",
            }
        : {
            Icon: MessageSquare,
            detail: "to create new conversations",
          };

  useEffect(() => {
    if (isOpen && isSignedIn) {
      void loadHistory();
    }
  }, [historyType, isOpen, isSignedIn]);

  useEffect(() => {
    if (isOpen) {
      setHistoryType(preferredHistoryType);
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
      const data = await fetchConversations(authFetch);
      setConversations(data);
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
      setLessons(await fetchLessons(authFetch));
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
      setCollections(await fetchCollections(authFetch));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadHistory() {
    if (historyType === "lessons") {
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
      const newConv = await createConversation(authFetch, {
        title,
        sourceLanguage: currentSourceLanguage,
        targetLanguage: currentTargetLanguage,
      });
      setConversations((previous) => [newConv, ...previous]);
      await onNewConversation(newConv);
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
    try {
      setArchivingConversationId(conversationId);
      setError("");
      setOpenConversationMenuId(null);
      await archiveConversation(authFetch, conversationId);
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
    const title = (conversation.title ?? "")
      .replace(/^[A-Z]{2}\s*(?:->|\u2192)\s*[A-Z]{2}\s+/i, "")
      .trim();

    return title || "New chat";
  }

function renderConversationFlags(conversation) {
    const sourceCountryCode = getFlagCountryCode(conversation.source_language);
    const targetCountryCode = getFlagCountryCode(conversation.target_language);

    return (
      <div className="mt-0.5 flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1">
        <LanguageFlag
          countryCode={sourceCountryCode}
          label={conversation.source_language}
          className="h-4 w-5"
        />
        <ArrowRight
          aria-hidden="true"
          className="h-2 w-2 shrink-0 text-zinc-500"
          strokeWidth={2.25}
        />
        <LanguageFlag
          countryCode={targetCountryCode}
          label={conversation.target_language}
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

  const actionButton = isSignedIn ? (
    historyType === "chats" ? (
      <button
        onClick={handleNewConversation}
        disabled={isBusy}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 font-medium text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
        New Conversation
      </button>
    ) : historyType === "collections" ? (
      <button
        onClick={handleOpenCollections}
        disabled={isBusy}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 font-medium text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Bookmark size={18} />
        Open collections
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
    )
  ) : (
    <button
      type="button"
      onClick={onRequireSignIn}
      className="flex w-full items-center gap-3 rounded-[1.5rem] border border-emerald-300/16 bg-[linear-gradient(135deg,rgba(16,185,129,0.12),rgba(24,24,27,0.88))] px-3.5 py-3 text-left shadow-[0_18px_40px_rgba(0,0,0,0.22)] ring-1 ring-inset ring-white/5 transition hover:border-emerald-300/24 hover:bg-[linear-gradient(135deg,rgba(16,185,129,0.16),rgba(24,24,27,0.92))] focus:outline-none focus:ring-2 focus:ring-emerald-300/25"
    >
      <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[1rem] border border-emerald-300/20 bg-emerald-400/[0.12] text-emerald-100 shadow-[0_0_24px_rgba(16,185,129,0.10)]">
        <signedOutCallout.Icon size={20} />
      </span>
      <span className="min-w-0">
        <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-emerald-100/90">
          Sign in
        </span>
        <span className="mt-1 block text-sm font-medium text-zinc-200">
          {signedOutCallout.detail}
        </span>
      </span>
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
              aria-label="Collection history"
              title="Collection history"
            >
              <Bookmark size={15} />
            </button>
          </div>
        </div>

        <div className="border-b border-white/10 p-4">
          {actionButton}
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {error && (
            <div className="mb-2 rounded-lg border border-rose-500/20 bg-rose-500/10 p-3 text-sm text-rose-400">
              {error}
            </div>
          )}

          {loading && ((historyType === "chats" && conversations.length === 0) || (historyType === "lessons" && lessons.length === 0) || (historyType === "collections" && collections.length === 0)) && (
            <div className="flex justify-center p-8">
              <Loader2 size={24} className="animate-spin text-zinc-500" />
            </div>
          )}

          {!loading && historyType === "chats" && conversations.length === 0 && !error && isSignedIn && (
            <div className="p-8 text-center text-sm text-zinc-500">
              No saved conversations yet.
            </div>
          )}

          {!loading && historyType === "lessons" && lessons.length === 0 && !error && isSignedIn && (
            <div className="p-8 text-center text-sm text-zinc-500">
              No saved lessons yet.
            </div>
          )}

          {!loading && historyType === "collections" && collections.length === 0 && !error && isSignedIn && (
            <div className="p-8 text-center text-sm text-zinc-500">
              No saved collections yet.
            </div>
          )}

          {historyType === "chats" && conversations.map((conv) => {
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
                    <div className="truncate font-medium">{getDisplayTitle(conv)}</div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {new Date(conv.created_at).toLocaleDateString()}
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

          {historyType === "lessons" && lessons.map((lesson) => {
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

          {historyType === "collections" && collections.map((collection) => {
            const isSelected =
              currentCollectionLanguageCode === collection.languageCode;

            return (
              <button
                key={collection.id}
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
                    {collection.entryCount} {collection.entryCount === 1 ? "card" : "cards"}
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
