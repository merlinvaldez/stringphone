import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  computeReturnHomeState,
  getTtsVoiceOptions,
  getTtsVoiceModeOptions,
  getAuthMenuConfig,
  getSharedRoomHeaderState,
  computeLeaveSharedRoomState,
} from '../client/src/shellHelpers.js';

const ROOT_DIR = resolve(import.meta.dirname, '..');

// ============================================================================
// 1. Pure Helper Unit Tests
// ============================================================================

// 1.1 computeReturnHomeState: preserves conversation & messages
{
  const activeMessages = [
    { id: 'm-1', text: 'Hello', sender: 'self' },
    { id: 'm-2', text: 'Hola', sender: 'partner' },
  ];
  const initialState = {
    appMode: 'lesson',
    isSidebarOpen: true,
    messages: activeMessages,
    currentConversationId: 'conv-123',
    activeLocalConversationId: 'local-conv-456',
    activeLesson: { id: 'lesson-1' },
    activeCollectionLanguageCode: 'es',
    learningView: 'lessons',
    lessonBuilderConfig: { topic: 'food' },
  };

  const nextState = computeReturnHomeState(initialState);

  assert.equal(nextState.appMode, 'chat', 'handleReturnHome must switch appMode to chat');
  assert.equal(nextState.isSidebarOpen, false, 'handleReturnHome must close sidebar');
  assert.equal(nextState.messages, activeMessages, 'handleReturnHome must preserve messages array reference');
  assert.equal(nextState.currentConversationId, 'conv-123', 'handleReturnHome must preserve currentConversationId');
  assert.equal(nextState.activeLocalConversationId, 'local-conv-456', 'handleReturnHome must preserve activeLocalConversationId');
  assert.equal(nextState.activeLesson, null, 'activeLesson must be reset on return home');
  assert.equal(nextState.activeCollectionLanguageCode, null, 'activeCollectionLanguageCode must be reset');
  assert.equal(nextState.learningView, 'collections', 'learningView must reset to collections');
  assert.equal(nextState.lessonBuilderConfig, null, 'lessonBuilderConfig must reset');
}

// 1.2 getTtsVoiceOptions & getTtsVoiceModeOptions
{
  const optionsDefault = getTtsVoiceOptions('marin');
  assert.equal(optionsDefault.length, 2);
  assert.deepEqual(optionsDefault[0], { id: 'marin', label: 'Female', selected: true });
  assert.deepEqual(optionsDefault[1], { id: 'onyx', label: 'Male', selected: false });

  const optionsMale = getTtsVoiceOptions('onyx');
  assert.equal(optionsMale[0].selected, false);
  assert.equal(optionsMale[1].selected, true);

  const modeClone = getTtsVoiceModeOptions('voice_clone');
  assert.deepEqual(modeClone[0], { id: 'ai_tts', label: 'AI TTS voice', selected: false });
  assert.deepEqual(modeClone[1], { id: 'voice_clone', label: 'Voice clone', selected: true });

  const modeAi = getTtsVoiceModeOptions('ai_tts');
  assert.deepEqual(modeAi[0], { id: 'ai_tts', label: 'AI TTS voice', selected: true });
  assert.deepEqual(modeAi[1], { id: 'voice_clone', label: 'Voice clone', selected: false });
}

// 1.3 getAuthMenuConfig: unconditional AI TTS voice and proper footer action
{
  const signedOutConfig = getAuthMenuConfig({ isSignedIn: false });
  assert.equal(signedOutConfig.showTtsVoiceSection, true, 'AI TTS voice must be shown for signed-out users');
  assert.equal(signedOutConfig.triggerAriaLabel, 'AI TTS voice settings');
  assert.deepEqual(signedOutConfig.footerAction, { type: 'sign_in', label: 'Sign in' });

  const signedInConfig = getAuthMenuConfig({ isSignedIn: true });
  assert.equal(signedInConfig.showTtsVoiceSection, true, 'AI TTS voice must be shown for signed-in users');
  assert.equal(signedInConfig.triggerAriaLabel, 'Open account menu');
  assert.deepEqual(signedInConfig.footerAction, { type: 'sign_out', label: 'Sign out' });

  const signingOutConfig = getAuthMenuConfig({ isSignedIn: true, isSigningOut: true });
  assert.deepEqual(signingOutConfig.footerAction, { type: 'sign_out', label: 'Logging out' });
}

// 1.4 getSharedRoomHeaderState: visibility and leave button props
{
  const idleState = getSharedRoomHeaderState({ sharedRoomSession: null });
  assert.equal(idleState.shouldRenderControls, false, 'Controls must not render when sharedRoomSession is null');

  const guestState = getSharedRoomHeaderState({
    sharedRoomSession: { role: 'guest' },
    room: { participantCount: 2 },
  });
  assert.equal(guestState.shouldRenderControls, true);
  assert.equal(guestState.showLeaveButton, true, 'Guest participant must have a Leave button');
  assert.equal(guestState.role, 'guest');
  assert.equal(guestState.participantCountLabel, '2/2');

  const hostState = getSharedRoomHeaderState({
    sharedRoomSession: { role: 'host' },
    room: { participantCount: 1 },
  });
  assert.equal(hostState.shouldRenderControls, true);
  assert.equal(hostState.showLeaveButton, true, 'Host must also have a Leave button');
  assert.equal(hostState.role, 'host');
}

// 1.5 computeLeaveSharedRoomState: clears room session, error, and notices
{
  const leftState = computeLeaveSharedRoomState();
  assert.equal(leftState.sharedRoomSession, null);
  assert.equal(leftState.pendingInviteToken, '');
  assert.equal(leftState.sharedRoomStatus, 'idle');
  assert.equal(leftState.sharedRoomError, '');
  assert.equal(leftState.sharedRoomCopyNotice, '');
  assert.equal(leftState.modeLockNotice, null);
  assert.equal(leftState.sharedRoom, null);
  assert.deepEqual(leftState.sharedRoomMessages, []);
}

// ============================================================================
// 2. Source Code Contract Tests
// ============================================================================

const stringPhoneAppSrc = readFileSync(
  resolve(ROOT_DIR, 'client/src/StringPhoneApp.jsx'),
  'utf8',
);
const chatHeaderSrc = readFileSync(
  resolve(ROOT_DIR, 'client/src/components/chat/ChatHeader.jsx'),
  'utf8',
);
const chatScreenSrc = readFileSync(
  resolve(ROOT_DIR, 'client/src/components/chat/ChatScreen.jsx'),
  'utf8',
);

// 2.1 FloatingAuthControls in StringPhoneApp.jsx
{
  // Icons imported
  assert.match(
    stringPhoneAppSrc,
    /\bSettings\b/,
    'StringPhoneApp.jsx must import Settings from lucide-react',
  );
  assert.match(
    stringPhoneAppSrc,
    /\bLogOut\b/,
    'StringPhoneApp.jsx must import LogOut from lucide-react',
  );

  // Signed-out circular trigger
  assert.match(
    stringPhoneAppSrc,
    /aria-label="AI TTS voice settings"/,
    'FloatingAuthControls must render a trigger button with aria-label="AI TTS voice settings"',
  );
  assert.match(
    stringPhoneAppSrc,
    /h-10\s+w-10\s+.*rounded-full/,
    'Settings trigger button must be a 40px circular button (h-10 w-10 rounded-full)',
  );

  // AI TTS voice / Voice clone mode options & Female / Male / Clear cloned voices
  assert.match(
    stringPhoneAppSrc,
    /AI TTS voice/,
    'FloatingAuthControls must display "AI TTS voice"',
  );
  assert.match(
    stringPhoneAppSrc,
    /Voice clone/,
    'FloatingAuthControls must display "Voice clone"',
  );
  assert.match(
    stringPhoneAppSrc,
    /Clear cloned voices/,
    'FloatingAuthControls must include "Clear cloned voices" button',
  );
  assert.match(
    stringPhoneAppSrc,
    /Female/,
    'FloatingAuthControls must include "Female" voice option',
  );
  assert.match(
    stringPhoneAppSrc,
    /Male/,
    'FloatingAuthControls must include "Male" voice option',
  );

  // Hairline divider
  assert.match(
    stringPhoneAppSrc,
    /border-t\s+border-white\/10/,
    'FloatingAuthControls must render a hairline divider border-t border-white/10 above the footer action',
  );

  // Sign in footer button
  assert.match(
    stringPhoneAppSrc,
    /SignInButton/,
    'FloatingAuthControls must render SignInButton for signed-out users in the popover',
  );
}

// 2.2 handleReturnHome preservation
{
  const returnHomeMatch = stringPhoneAppSrc.match(
    /const handleReturnHome = \(\) => \{([\s\S]*?)\};/,
  );
  assert.ok(returnHomeMatch, 'handleReturnHome must be defined in StringPhoneApp.jsx');
  const returnHomeBody = returnHomeMatch[1];

  assert.doesNotMatch(
    returnHomeBody,
    /\bclearMessages\s*\(/,
    'handleReturnHome must NOT call clearMessages()',
  );
  assert.doesNotMatch(
    returnHomeBody,
    /\bsetCurrentConversationId\s*\(\s*null\s*\)/,
    'handleReturnHome must NOT call setCurrentConversationId(null)',
  );
  assert.match(
    returnHomeBody,
    /setAppMode\(\s*["']chat["']\s*\)/,
    'handleReturnHome must set appMode to "chat"',
  );
  assert.match(
    returnHomeBody,
    /setIsSidebarOpen\(\s*false\s*\)/,
    'handleReturnHome must close the sidebar',
  );
}

// 2.3 SharedRoomControls in ChatHeader and onLeaveRoom
{
  assert.match(
    chatHeaderSrc,
    /\bSharedRoomControls\b/,
    'ChatHeader.jsx must import and reference SharedRoomControls',
  );
  assert.match(
    chatHeaderSrc,
    /sharedRoomSession\s*\?\s*\(?[\s\S]*?<SharedRoomControls/,
    'ChatHeader.jsx must render SharedRoomControls only when sharedRoomSession is truthy',
  );
  assert.match(
    chatHeaderSrc,
    /onLeaveRoom=\{onLeaveSharedRoom\}/,
    'ChatHeader.jsx must forward onLeaveSharedRoom to SharedRoomControls as onLeaveRoom',
  );

  // ChatScreen forwarding
  assert.match(
    chatScreenSrc,
    /\bonLeaveSharedRoom\b/,
    'ChatScreen.jsx must accept and forward onLeaveSharedRoom',
  );

  // SharedRoomControls component in StringPhoneApp.jsx
  assert.match(
    stringPhoneAppSrc,
    /export function SharedRoomControls\(\{[\s\S]*?onLeaveRoom[\s\S]*?\}\)/,
    'SharedRoomControls must accept onLeaveRoom prop',
  );
  assert.match(
    stringPhoneAppSrc,
    />\s*Leave\s*<\/button>/,
    'SharedRoomControls must render a Leave button element',
  );
}

console.log('All Web Shell Parity checks passed successfully.');
