import React, { useState } from "react";
import { ArrowRight } from "lucide-react";
import { LanguageSelector, SharedRoomControls } from "../../StringPhoneApp.jsx";

export function ChatHeader({
  myLang,
  setMyLang,
  theirLang,
  setTheirLang,
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
}) {
  const [openLanguageSelector, setOpenLanguageSelector] = useState(null);
  const useCompactMobileLanguageButtons = Boolean(sharedRoomSession);
  const hostCanEditSharedRoomLanguages =
    sharedRoomSession?.role === "host" && !sharedRoom?.guestJoined;
  const selectorsDisabled =
    disabled || (Boolean(sharedRoomSession) && !hostCanEditSharedRoomLanguages);

  return (
    <div className="relative z-20 mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 sm:grid-cols-[1fr_auto_1fr] sm:gap-3 sm:px-1">
      <div className="hidden sm:block" />

      <div className="flex min-w-0 items-center gap-2 sm:justify-center sm:gap-3">
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
        <ArrowRight
          size={14}
          className="shrink-0 text-zinc-500"
          strokeWidth={1.7}
        />
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

      <div className="justify-self-end">
        <SharedRoomControls
          roomSession={sharedRoomSession}
          room={sharedRoom}
          roomStatus={sharedRoomStatus}
          pendingInviteToken={pendingInviteToken}
          disabled={disabled}
          copyNoticeMessage={sharedRoomCopyNotice}
          onDismissCopyNotice={onDismissSharedRoomCopyNotice}
          onToggleRoom={onToggleSharedRoom}
          onCopyInviteLink={onCopySharedRoomInvite}
        />
      </div>
    </div>
  );
}
