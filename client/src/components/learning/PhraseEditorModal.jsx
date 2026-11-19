import React, { useEffect, useId, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { getTextDirectionAttrs } from '../../chatParityHelpers.js';
import { validatePhrasebookEditorInput } from './phrasebookHelpers.js';

/**
 * Modal editor for creating and editing phrasebook cards.
 * Front-first layout: Phrase language & Phrase in targetLanguageCode,
 * Meaning & notes in sourceLanguageCode.
 */
export function PhraseEditorModal({
  isOpen,
  entry = null,
  availableLanguages = [],
  requireMeaning = false,
  isSaving = false,
  error = null,
  onClose,
  onSave,
}) {
  const [targetLanguageCode, setTargetLanguageCode] = useState('es');
  const [sourceLanguageCode, setSourceLanguageCode] = useState('en');
  const [phraseText, setPhraseText] = useState('');
  const [phrasePronunciation, setPhrasePronunciation] = useState('');
  const [meaningText, setMeaningText] = useState('');
  const [meaningPronunciation, setMeaningPronunciation] = useState('');
  const [noteText, setNoteText] = useState('');
  const [localError, setLocalError] = useState('');

  const targetLangSelectId = useId();
  const sourceLangSelectId = useId();

  // Reset or pre-fill form fields whenever entry or isOpen changes
  useEffect(() => {
    if (!isOpen) {
      setLocalError('');
      return;
    }

    setTargetLanguageCode(entry?.targetLanguageCode || 'es');
    setSourceLanguageCode(entry?.sourceLanguageCode || 'en');
    setPhraseText(entry?.phraseText || '');
    setPhrasePronunciation(entry?.phrasePronunciation || '');
    setMeaningText(entry?.meaningText || '');
    setMeaningPronunciation(entry?.meaningPronunciation || '');
    setNoteText(entry?.noteText || '');
    setLocalError('');
  }, [entry, isOpen]);

  // Handle Escape key to close modal
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !isSaving) {
        onClose?.();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSaving, onClose]);

  if (!isOpen) {
    return null;
  }

  const phraseDirAttrs = getTextDirectionAttrs(targetLanguageCode);
  const meaningDirAttrs = getTextDirectionAttrs(sourceLanguageCode);

  const handleSubmit = (event) => {
    event?.preventDefault();
    setLocalError('');

    try {
      const validated = validatePhrasebookEditorInput(
        {
          targetLanguageCode,
          sourceLanguageCode,
          phraseText,
          phrasePronunciation,
          meaningText,
          meaningPronunciation,
          noteText,
        },
        { requireMeaning },
      );
      onSave?.(validated);
    } catch (err) {
      setLocalError(err.message || 'Please check the entered fields.');
    }
  };

  const displayedError = localError || error;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={entry ? 'Edit card' : 'New card'}
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-[1.75rem] border border-white/10 bg-zinc-900 p-6 shadow-2xl backdrop-blur-xl sm:p-7"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-white">
              {entry ? 'Edit card' : 'New card'}
            </h2>
            <p className="mt-1 text-xs text-zinc-400">
              Cards are stored in your phrasebook and organized by phrase language.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-300 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
            aria-label="Close"
            title="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
          {/* Languages Row */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor={targetLangSelectId}
                className="block text-xs font-medium uppercase tracking-wider text-zinc-400 mb-1.5"
              >
                Phrase language
              </label>
              <select
                id={targetLangSelectId}
                value={targetLanguageCode}
                onChange={(e) => setTargetLanguageCode(e.target.value.toLowerCase())}
                disabled={isSaving}
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/40 disabled:opacity-50"
              >
                {availableLanguages.map((lang) => (
                  <option key={lang.code} value={lang.code} className="bg-zinc-900 text-white">
                    {lang.name} ({lang.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor={sourceLangSelectId}
                className="block text-xs font-medium uppercase tracking-wider text-zinc-400 mb-1.5"
              >
                Meaning language
              </label>
              <select
                id={sourceLangSelectId}
                value={sourceLanguageCode}
                onChange={(e) => setSourceLanguageCode(e.target.value.toLowerCase())}
                disabled={isSaving}
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/40 disabled:opacity-50"
              >
                {availableLanguages.map((lang) => (
                  <option key={lang.code} value={lang.code} className="bg-zinc-900 text-white">
                    {lang.name} ({lang.code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Front of card: Phrase (Required) */}
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-zinc-400 mb-1.5">
              Phrase <span className="text-emerald-400">*</span>
            </label>
            <textarea
              rows={2}
              value={phraseText}
              onChange={(e) => setPhraseText(e.target.value)}
              placeholder="Phrase"
              aria-label="Phrase text"
              dir={phraseDirAttrs.dir}
              disabled={isSaving}
              className={`w-full rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-white placeholder:text-zinc-500 outline-none focus:border-emerald-400/40 disabled:opacity-50 resize-none ${phraseDirAttrs.className}`}
            />
          </div>

          {/* Phrase Pronunciation (Optional) */}
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-zinc-400 mb-1.5">
              Phrase pronunciation
            </label>
            <input
              type="text"
              value={phrasePronunciation}
              onChange={(e) => setPhrasePronunciation(e.target.value)}
              placeholder="Phrase pronunciation (optional)"
              aria-label="Phrase pronunciation"
              dir={phraseDirAttrs.dir}
              disabled={isSaving}
              className={`w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white placeholder:text-zinc-500 outline-none focus:border-emerald-400/40 disabled:opacity-50 ${phraseDirAttrs.className}`}
            />
          </div>

          {/* Back of card: Meaning / Translation */}
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-zinc-400 mb-1.5">
              Meaning {requireMeaning ? <span className="text-emerald-400">*</span> : <span className="text-zinc-500 font-normal">(optional)</span>}
            </label>
            <textarea
              rows={2}
              value={meaningText}
              onChange={(e) => setMeaningText(e.target.value)}
              placeholder={requireMeaning ? "Meaning" : "Meaning (optional)"}
              aria-label="Meaning"
              dir={meaningDirAttrs.dir}
              disabled={isSaving}
              className={`w-full rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-white placeholder:text-zinc-500 outline-none focus:border-emerald-400/40 disabled:opacity-50 resize-none ${meaningDirAttrs.className}`}
            />
          </div>

          {/* Meaning Pronunciation (Optional) */}
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-zinc-400 mb-1.5">
              Meaning pronunciation
            </label>
            <input
              type="text"
              value={meaningPronunciation}
              onChange={(e) => setMeaningPronunciation(e.target.value)}
              placeholder="Meaning pronunciation (optional)"
              aria-label="Meaning pronunciation"
              dir={meaningDirAttrs.dir}
              disabled={isSaving}
              className={`w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white placeholder:text-zinc-500 outline-none focus:border-emerald-400/40 disabled:opacity-50 ${meaningDirAttrs.className}`}
            />
          </div>

          {/* Note (Optional) */}
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-zinc-400 mb-1.5">
              Note
            </label>
            <textarea
              rows={2}
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Note (optional)"
              aria-label="Note"
              disabled={isSaving}
              className="w-full rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-white placeholder:text-zinc-500 outline-none focus:border-emerald-400/40 disabled:opacity-50 resize-none"
            />
          </div>

          {/* Error Message */}
          {displayedError ? (
            <div className="rounded-xl border border-rose-400/20 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-200">
              {displayedError}
            </div>
          ) : null}

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-zinc-300 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || !phraseText.trim() || (requireMeaning && !meaningText.trim())}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving ? <Loader2 size={16} className="animate-spin" /> : null}
              {isSaving ? 'Saving...' : 'Save card'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
