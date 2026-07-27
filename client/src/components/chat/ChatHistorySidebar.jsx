import React, { useEffect, useState } from "react";
import { X, MessageSquare, Plus, Loader2 } from "lucide-react";
import { fetchConversations, createConversation } from "../../chatApi.js";
import { useAppAuth } from "../../AuthContext.jsx";

export function ChatHistorySidebar({
  isOpen,
  onClose,
  currentConversationId,
  onSelectConversation,
  onNewConversation,
  currentSourceLanguage,
  currentTargetLanguage,
}) {
  const { authFetch, isSignedIn } = useAppAuth();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isOpen && isSignedIn) {
      loadConversations();
    }
  }, [isOpen, isSignedIn]);

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

  async function handleNewConversation() {
    try {
      setLoading(true);
      setError("");
      const title = `Chat - ${new Date().toLocaleDateString()}`;
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
      await onSelectConversation(conversation);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      <div className="fixed inset-y-0 left-0 z-50 w-80 bg-zinc-900 border-r border-white/10 shadow-2xl flex flex-col animate-in slide-in-from-left duration-300">
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h2 className="text-lg font-semibold text-white">Chat History</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white transition"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-4 border-b border-white/10">
          <button
            onClick={handleNewConversation}
            disabled={!isSignedIn || loading}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-medium rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
            New Conversation
          </button>
          {!isSignedIn && (
            <p className="mt-2 text-xs text-zinc-500 text-center">
              Sign in to save and continue chats.
            </p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {error && (
            <div className="p-3 mb-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
              {error}
            </div>
          )}

          {loading && conversations.length === 0 && (
            <div className="flex justify-center p-8">
              <Loader2 size={24} className="animate-spin text-zinc-500" />
            </div>
          )}

          {!loading && conversations.length === 0 && !error && isSignedIn && (
            <div className="text-center p-8 text-zinc-500 text-sm">
              No saved conversations yet.
            </div>
          )}

          {conversations.map((conv) => (
            <button
              key={conv.id}
              type="button"
              onClick={() => {
                void handleSelectConversation(conv);
              }}
              disabled={loading}
              className={`w-full flex items-start gap-3 p-3 rounded-xl transition text-left mb-1 ${
                currentConversationId === conv.id
                  ? "bg-white/10 text-white"
                  : "hover:bg-white/5 text-zinc-300"
              } ${
                loading ? "cursor-wait opacity-70" : ""
              }`}
            >
              <MessageSquare size={18} className="mt-0.5 shrink-0 text-emerald-400" />
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{conv.title}</div>
                <div className="text-xs text-zinc-500 mt-1">
                  {new Date(conv.created_at).toLocaleDateString()}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
