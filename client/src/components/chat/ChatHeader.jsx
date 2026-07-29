import React, { useState } from "react";
import { ArrowLeftRight, Menu } from "lucide-react";
import { LanguageSelector } from "../../StringPhoneApp.jsx";

export function ChatHeader({
  myLang,
  setMyLang,
  theirLang,
  setTheirLang,
  onInvertLanguages,
  disabled,
  uiStrings,
  sharedRoomSession,
  sharedRoom,
  sharedRoomStatus,
  sharedRoomInviteUrl,
  pendingInviteToken,
  sharedRoomCopyNotice,
  onDismissSharedRoomCopyNotice,
  onToggleSharedRoom,
  onCopySharedRoomInvite,
  onOpenSidebar,
}) {
  const [openLanguageSelector, setOpenLanguageSelector] = useState(null);
  const useCompactMobileLanguageButtons = Boolean(sharedRoomSession);
  const hostCanEditSharedRoomLanguages =
    sharedRoomSession?.role === "host" && !sharedRoom?.guestJoined;
  const selectorsDisabled =
    disabled || (Boolean(sharedRoomSession) && !hostCanEditSharedRoomLanguages);
  const invertDisabled =
    selectorsDisabled ||
    myLang.code === theirLang.code ||
    typeof onInvertLanguages !== "function";

  return (
    <div className="relative z-20 mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 sm:grid-cols-[1fr_auto_1fr] sm:gap-3 sm:px-1">
      <div className="hidden sm:flex items-center justify-start">
        {onOpenSidebar && (
          <button
            onClick={onOpenSidebar}
            className="p-2 rounded-full bg-white/5 border border-white/10 text-zinc-300 hover:text-white hover:bg-white/10 transition"
            title="History"
          >
            <Menu size={18} />
          </button>
        )}
      </div>

      <div className="flex min-w-0 items-center gap-2 sm:justify-center sm:gap-3">
        {/* Mobile sidebar toggle */}
        {onOpenSidebar && (
          <button
            onClick={onOpenSidebar}
            className="sm:hidden p-2 rounded-full bg-white/5 border border-white/10 text-zinc-300 hover:text-white hover:bg-white/10 transition flex-shrink-0"
            title="History"
          >
            <Menu size={18} />
          </button>
        )}
        <LanguageSelector
          selected={myLang}
          onSelect={setMyLang}
          disabled={selectorsDisabled}
          searchPlaceholder={uiStrings.searchLanguages}
          menuAlign="left"
          containerClassName={
            useCompactMobileLanguageButtons
              ? "w-11 flex-none sm:min-w-[148px] sm:flex-none"
              : "min-w-0 flex-1 sm:min-w-[148px] sm:flex-none"
          }
          buttonClassName={
            useCompactMobileLanguageButtons
              ? "min-w-0 px-0 sm:px-4"
              : "min-w-0 justify-center px-3 sm:px-4"
          }
          mobileFlagOnly={useCompactMobileLanguageButtons}
          isOpen={openLanguageSelector === "my"}
          onOpenChange={(nextOpen) => {
            setOpenLanguageSelector((currentOpen) =>
              nextOpen ? "my" : currentOpen === "my" ? null : currentOpen,
            );
          }}
        />
        <button
          type="button"
          onClick={onInvertLanguages}
          disabled={invertDisabled}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-300 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          title={uiStrings.invertLanguages}
          aria-label={uiStrings.invertLanguages}
        >
          <ArrowLeftRight size={16} strokeWidth={1.8} />
        </button>
        <LanguageSelector
          selected={theirLang}
          onSelect={setTheirLang}
          disabled={selectorsDisabled}
          searchPlaceholder={uiStrings.searchLanguages}
          menuAlign="right"
          mobileMenuFixedCenter
          containerClassName={
            useCompactMobileLanguageButtons
              ? "w-11 flex-none sm:min-w-[148px] sm:flex-none"
              : "min-w-0 flex-1 sm:min-w-[148px] sm:flex-none"
          }
          buttonClassName={
            useCompactMobileLanguageButtons
              ? "min-w-0 px-0 sm:px-4"
              : "min-w-0 justify-center px-3 sm:px-4"
          }
          mobileFlagOnly={useCompactMobileLanguageButtons}
          isOpen={openLanguageSelector === "their"}
          onOpenChange={(nextOpen) => {
            setOpenLanguageSelector((currentOpen) =>
              nextOpen ? "their" : currentOpen === "their" ? null : currentOpen,
            );
          }}
        />
      </div>

    </div>
  );
}
