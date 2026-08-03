import React from "react";
import { Bookmark, GraduationCap } from "lucide-react";
import { LessonScreen } from "../lessons/LessonScreen.jsx";
import { CollectionScreen } from "./CollectionScreen.jsx";

const LEARNING_TABS = [
  {
    id: "lessons",
    label: "Lessons",
    Icon: GraduationCap,
  },
  {
    id: "collections",
    label: "Phrasebook",
    Icon: Bookmark,
  },
];

export function LearningScreen({
  learningView,
  onSelectLearningView,
  activeLesson,
  myLang,
  theirLang,
  currentMessages,
  isSignedIn,
  authFetch,
  lessonBuilderConfig,
  onCreateLesson,
  onStartNewLesson,
  onOpenSidebar,
  onPlayGeneratedSpeech,
  onSaveLessonVocabularyToCollection,
  onRequireSignIn,
  availableLanguages,
  activeCollectionLanguageCode,
  onSelectCollectionLanguageCode,
}) {
  return (
    <div className="relative h-full">
      <div
        className="pointer-events-none absolute inset-x-0 z-20 flex justify-center px-4"
        style={{ top: "calc(env(safe-area-inset-top, 0px) + 5.75rem)" }}
      >
        <div className="pointer-events-auto flex gap-1 rounded-full border border-white/10 bg-white/5 p-1.5 shadow-2xl backdrop-blur-xl">
          {LEARNING_TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => onSelectLearningView(id)}
              aria-label={label}
              aria-pressed={learningView === id}
              title={label}
              className={`relative flex h-10 w-10 items-center justify-center rounded-full transition-all duration-300 ${
                learningView === id
                  ? "text-white"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <Icon size={17} strokeWidth={2.1} />
              {learningView === id ? (
                <div className="absolute inset-0 -z-10 rounded-full border border-white/10 bg-white/10 shadow-sm" />
              ) : null}
            </button>
          ))}
        </div>
      </div>

      {learningView === "collections" ? (
        <CollectionScreen
          authFetch={authFetch}
          isSignedIn={isSignedIn}
          myLang={myLang}
          theirLang={theirLang}
          availableLanguages={availableLanguages}
          activeLanguageCode={activeCollectionLanguageCode}
          onSelectLanguageCode={onSelectCollectionLanguageCode}
          onOpenSidebar={onOpenSidebar}
          onRequireSignIn={onRequireSignIn}
          onPlayGeneratedSpeech={onPlayGeneratedSpeech}
        />
      ) : (
        <LessonScreen
          activeLesson={activeLesson}
          myLang={myLang}
          theirLang={theirLang}
          currentMessages={currentMessages}
          isSignedIn={isSignedIn}
          onCreateLesson={onCreateLesson}
          onStartNewLesson={onStartNewLesson}
          onOpenSidebar={onOpenSidebar}
          onPlayGeneratedSpeech={onPlayGeneratedSpeech}
          onSaveLessonVocabularyToCollection={onSaveLessonVocabularyToCollection}
          lessonBuilderConfig={lessonBuilderConfig}
        />
      )}
    </div>
  );
}
