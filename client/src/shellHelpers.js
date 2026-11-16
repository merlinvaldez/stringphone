/**
 * Pure shell helper functions for Web-APK parity.
 * Used by FloatingAuthControls, handleReturnHome, SharedRoomControls, and ChatHeader.
 */

export const TTS_VOICE_OPTIONS = [
  { id: 'marin', label: 'Female' },
  { id: 'onyx', label: 'Male' },
];

/**
 * Computes the next state transition when the user taps/clicks "Return home".
 * Switches appMode to 'chat' and closes the sidebar, but keeps active conversation
 * and messages intact.
 *
 * @param {object} currentState
 * @returns {object} nextState
 */
export function computeReturnHomeState(currentState = {}) {
  return {
    ...currentState,
    appMode: 'chat',
    isSidebarOpen: false,
    activeLesson: null,
    activeCollectionLanguageCode: null,
    learningView: 'collections',
    lessonBuilderConfig: null,
    messages: currentState.messages ?? [],
    currentConversationId: currentState.currentConversationId ?? null,
    ...(currentState.activeLocalConversationId !== undefined
      ? { activeLocalConversationId: currentState.activeLocalConversationId }
      : {}),
  };
}

/**
 * Returns available AI TTS voice options with the selected voice marked.
 *
 * @param {'marin' | 'onyx' | string} activeVoice
 * @returns {Array<{ id: string, label: string, selected: boolean }>}
 */
export function getTtsVoiceOptions(activeVoice = 'marin') {
  return TTS_VOICE_OPTIONS.map((option) => ({
    ...option,
    selected: option.id === activeVoice,
  }));
}

/**
 * Returns the authentication menu / settings popover configuration.
 * AI TTS voice is shown unconditionally for both signed-out guests and signed-in users.
 *
 * @param {{ isSignedIn: boolean, isSigningOut?: boolean }} params
 * @returns {{
 *   showTtsVoiceSection: boolean,
 *   triggerAriaLabel: string,
 *   footerAction: { type: 'sign_in' | 'sign_out', label: string }
 * }}
 */
export function getAuthMenuConfig({ isSignedIn, isSigningOut = false }) {
  return {
    showTtsVoiceSection: true,
    triggerAriaLabel: isSignedIn ? 'Open account menu' : 'AI TTS voice settings',
    footerAction: isSignedIn
      ? { type: 'sign_out', label: isSigningOut ? 'Logging out' : 'Sign out' }
      : { type: 'sign_in', label: 'Sign in' },
  };
}

/**
 * Returns header display and leave button state for shared room sessions.
 *
 * @param {{
 *   sharedRoomSession: object | null,
 *   room?: object | null,
 *   isGuestParticipant?: boolean
 * }} params
 * @returns {{
 *   shouldRenderControls: boolean,
 *   participantCountLabel: string,
 *   participantLabel: string,
 *   showLeaveButton: boolean,
 *   role: 'guest' | 'host' | ''
 * }}
 */
export function getSharedRoomHeaderState({ sharedRoomSession, room, isGuestParticipant }) {
  if (!sharedRoomSession) {
    return {
      shouldRenderControls: false,
      participantCountLabel: '',
      participantLabel: '',
      showLeaveButton: false,
      role: '',
    };
  }

  const count = room?.participantCount ?? 1;
  const isGuest = isGuestParticipant ?? (sharedRoomSession.role === 'guest');

  return {
    shouldRenderControls: true,
    participantCountLabel: `${count}/2`,
    participantLabel: `${count}/2 joined`,
    showLeaveButton: true,
    role: isGuest ? 'guest' : 'host',
  };
}

/**
 * Returns the state updates needed when leaving a shared room.
 *
 * @returns {object}
 */
export function computeLeaveSharedRoomState() {
  return {
    sharedRoomSession: null,
    pendingInviteToken: '',
    sharedRoomStatus: 'idle',
    sharedRoomError: '',
    sharedRoomCopyNotice: '',
    modeLockNotice: null,
    sharedRoom: null,
    sharedRoomMessages: [],
  };
}
