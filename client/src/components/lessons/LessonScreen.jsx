import React, { useState } from "react";
import {
  BookOpen,
  ChevronRight,
  GraduationCap,
  Loader2,
  Menu,
  MessageSquareText,
  Plus,
  Sparkles,
} from "lucide-react";
import { formatPronunciationGuide } from "../../utils.js";

function PhoneticSpelling({ value, className }) {
  const pronunciation = formatPronunciationGuide(value);

  if (!pronunciation) {
    return null;
  }

  return <p className={className}>({pronunciation})</p>;
}

function LessonHistoryButton({ onOpenSidebar }) {
  if (!onOpenSidebar) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={onOpenSidebar}
      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-300 transition hover:bg-white/10 hover:text-white"
      title="History"
      aria-label="Open history"
    >
      <Menu size={18} />
    </button>
  );
}

function LessonBuilder({
  myLang,
  theirLang,
  currentMessages,
  isSignedIn,
  onCreateLesson,
  onOpenSidebar,
}) {
  const [source, setSource] = useState("topic");
  const [topic, setTopic] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");
  const chatTurnCount = currentMessages.filter(
    (message) =>
      message.status === "ready" &&
      (message.originalText || message.translatedText),
  ).length;

  const handleCreate = async () => {
    if (!isSignedIn) {
      setError("Sign in to create and save a lesson.");
      return;
    }

    if (source === "topic" && topic.trim().length < 2) {
      setError("Enter a topic or situation first.");
      return;
    }

    if (source === "chat" && chatTurnCount === 0) {
      setError("Send a chat message first, then turn it into a lesson.");
      return;
    }

    try {
      setError("");
      setIsCreating(true);
      await onCreateLesson({ source, topic: topic.trim() });
    } catch (creationError) {
      setError(creationError.message || "Could not create a lesson.");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-4xl flex-col overflow-y-auto px-4 pb-8 pt-28 sm:px-6 sm:pt-32">
      <div className="mx-auto mb-4 flex w-full max-w-2xl justify-start">
        <LessonHistoryButton onOpenSidebar={onOpenSidebar} />
      </div>
      <div className="mx-auto w-full max-w-2xl rounded-[2rem] border border-white/10 bg-zinc-900/70 p-5 shadow-2xl backdrop-blur-xl sm:p-8">
        <div className="mb-7 flex items-start gap-4">
          <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-emerald-300/20 bg-emerald-400/10 text-emerald-200 shadow-[0_0_30px_rgba(16,185,129,0.12)]">
            <GraduationCap size={23} />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300/80">
              Little lesson
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Practice {theirLang.name} for a real moment.
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
              Build a short lesson from what you have been chatting about or from a situation you want to handle.
            </p>
          </div>
        </div>

        <div
          role="tablist"
          aria-label="Lesson source"
          className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-black/20 p-1.5"
        >
          <button
            type="button"
            role="tab"
            aria-selected={source === "topic"}
            onClick={() => setSource("topic")}
            className={`flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-medium transition ${
              source === "topic"
                ? "bg-white/10 text-white shadow-sm"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <Sparkles size={16} />
            New topic
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={source === "chat"}
            onClick={() => setSource("chat")}
            className={`flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-medium transition ${
              source === "chat"
                ? "bg-white/10 text-white shadow-sm"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <MessageSquareText size={16} />
            This chat
          </button>
        </div>

        {source === "topic" ? (
          <label className="mt-5 block">
            <span className="mb-2 block text-sm font-medium text-zinc-200">
              What do you want to be able to do?
            </span>
            <input
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleCreate();
                }
              }}
              placeholder="e.g., ordering breakfast at a café"
              disabled={isCreating}
              className="h-14 w-full rounded-2xl border border-white/10 bg-black/25 px-4 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-400/40 disabled:cursor-wait disabled:opacity-60"
            />
          </label>
        ) : (
          <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
            <p className="text-sm font-medium text-zinc-200">
              Use the latest {chatTurnCount} {chatTurnCount === 1 ? "message" : "messages"}
            </p>
            <p className="mt-1 text-sm leading-5 text-zinc-500">
              We will extract practical words and phrases from this conversation without adding the raw transcript to your lesson history.
            </p>
          </div>
        )}

        {error ? (
          <p className="mt-4 rounded-xl border border-rose-400/15 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex items-center justify-between gap-4 border-t border-white/10 pt-5">
          <p className="text-xs text-zinc-500">
            {myLang.name} → {theirLang.name}
          </p>
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={isCreating || (source === "chat" && chatTurnCount === 0)}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isCreating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {isCreating ? "Creating…" : "Create lesson"}
          </button>
        </div>
      </div>
    </div>
  );
}

function LessonContent({ lesson, onStartNewLesson, onOpenSidebar }) {
  const content = lesson?.content ?? lesson?.lesson_content ?? lesson;
  const [showAnswer, setShowAnswer] = useState(false);
  const vocabulary = Array.isArray(content?.vocabulary) ? content.vocabulary : [];
  const phrases = Array.isArray(content?.phrases) ? content.phrases : [];

  return (
    <div className="mx-auto h-full w-full max-w-5xl overflow-y-auto px-4 pb-8 pt-28 sm:px-6 sm:pt-32">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <div className="mb-4 flex justify-start">
              <LessonHistoryButton onOpenSidebar={onOpenSidebar} />
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300/80">
              {lesson.source === "chat" ? "From this chat" : "On-demand lesson"}
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              {content.title}
            </h1>
            <PhoneticSpelling
              value={content.titleTransliteration}
              className="mt-2 text-sm text-emerald-200/80"
            />
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">{content.summary}</p>
          </div>
          <button
            type="button"
            onClick={onStartNewLesson}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm font-medium text-zinc-200 transition hover:bg-white/[0.08]"
          >
            <Plus size={16} />
            <span className="hidden sm:inline">New lesson</span>
          </button>
        </div>

        <section className="rounded-[1.75rem] border border-white/10 bg-zinc-900/70 p-5 shadow-xl backdrop-blur-xl sm:p-6">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-white">
            <BookOpen size={17} className="text-emerald-300" />
            Key words
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {vocabulary.map((item, index) => (
              <div key={`${item.term}-${index}`} className="rounded-2xl border border-white/8 bg-black/20 p-4">
                <p className="font-medium text-white">{item.term}</p>
                <PhoneticSpelling
                  value={item.transliteration}
                  className="mt-1 text-sm text-emerald-200/80"
                />
                <p className="mt-1 text-sm text-zinc-400">{item.translation}</p>
                {item.example ? <p className="mt-3 text-sm leading-5 text-zinc-300">“{item.example}”</p> : null}
                <PhoneticSpelling
                  value={item.exampleTransliteration}
                  className="mt-1 text-xs leading-5 text-emerald-100/70"
                />
                {item.exampleTranslation ? <p className="mt-1 text-xs leading-5 text-zinc-500">{item.exampleTranslation}</p> : null}
              </div>
            ))}
          </div>
        </section>

        <section className="mt-4 rounded-[1.75rem] border border-white/10 bg-zinc-900/70 p-5 shadow-xl backdrop-blur-xl sm:p-6">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-white">
            <MessageSquareText size={17} className="text-sky-300" />
            Say it naturally
          </div>
          <div className="space-y-3">
            {phrases.map((item, index) => (
              <div key={`${item.phrase}-${index}`} className="rounded-2xl border border-white/8 bg-black/20 p-4">
                <p className="font-medium text-white">{item.phrase}</p>
                <PhoneticSpelling
                  value={item.transliteration}
                  className="mt-1 text-sm text-emerald-200/80"
                />
                <p className="mt-1 text-sm text-zinc-400">{item.translation}</p>
                {item.note ? <p className="mt-2 text-xs leading-5 text-emerald-100/65">{item.note}</p> : null}
              </div>
            ))}
          </div>
        </section>

        <section className="mt-4 grid gap-4 sm:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-[1.75rem] border border-amber-300/15 bg-amber-300/[0.06] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-200/75">Quick tip</p>
            <h2 className="mt-2 font-semibold text-white">{content.tip?.title}</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-300">{content.tip?.body}</p>
          </div>
          <div className="rounded-[1.75rem] border border-emerald-300/15 bg-emerald-400/[0.06] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-200/75">Try it</p>
            <p className="mt-2 text-sm leading-6 text-white">{content.challenge?.prompt}</p>
            {showAnswer ? (
              <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
                <p className="text-sm leading-6 text-emerald-100">
                  {content.challenge?.sampleAnswer}
                </p>
                <PhoneticSpelling
                  value={content.challenge?.sampleAnswerTransliteration}
                  className="mt-2 text-xs leading-5 text-emerald-100/70"
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowAnswer(true)}
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-emerald-200 transition hover:text-emerald-100"
              >
                Reveal a sample answer <ChevronRight size={15} />
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

export function LessonScreen({
  activeLesson,
  myLang,
  theirLang,
  currentMessages,
  isSignedIn,
  onCreateLesson,
  onStartNewLesson,
  onOpenSidebar,
}) {
  const content = activeLesson?.content ?? activeLesson?.lesson_content;

  if (content?.title) {
    return (
      <LessonContent
        key={activeLesson?.id ?? content.title}
        lesson={activeLesson}
        onStartNewLesson={onStartNewLesson}
        onOpenSidebar={onOpenSidebar}
      />
    );
  }

  return (
    <LessonBuilder
      myLang={myLang}
      theirLang={theirLang}
      currentMessages={currentMessages}
      isSignedIn={isSignedIn}
      onCreateLesson={onCreateLesson}
      onOpenSidebar={onOpenSidebar}
    />
  );
}
