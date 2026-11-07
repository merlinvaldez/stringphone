# Single View Invert Button & Conversation View Logo 360 Spin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a language invert button to the Single View matching Chat View's button design, and make the center logo in Two-Person Conversation View animate a 360° spin on tap while inverting conversation languages.

**Architecture:** Use the existing `createTextChatController.swapLanguages(mode)` capability for both modes. In `SingleView.tsx`, place a 44x44 circular repeat button between the two `LanguagePicker` controls in the bottom actions bar. In `ConversationView.tsx`, enable touch interaction on the center divider badge (`pointerEvents="box-none"`), drive a 360° rotation using React Native `Animated.timing`, and swap conversation languages.

**Tech Stack:** React Native 0.86, Expo 57, TypeScript, React 19, `@expo/vector-icons` (Feather).

**Spec:** `docs/superpowers/specs/2026-11-07-single-view-invert-and-convo-spin-design.md`

## Global Constraints

- Never break offline capabilities or SQLite persistence for saved conversations.
- Maintain landscape layout correctness in `ConversationView.tsx` (accounting for its `-90deg` badge transform).
- All new interactive elements must have proper accessibility roles (`accessibilityRole="button"`) and accessible labels (`accessibilityLabel="Invert languages"`).
- Invert buttons must be disabled during active recording (`isRecording`), processing (`isProcessing`), when locked, or when both languages are identical (`state.myLanguage === state.theirLanguage`).

## Review Focus

1. **Simultaneous/rapid taps during logo spin**: Must not queue or corrupt rotation state; resetting or debouncing ensures smooth completion.
2. **Conversation in landscape mode**: Center badge base rotation of `-90deg` must complete a full 360° rotation and land back at `-90deg` without visual glitches.
3. **Single view small screen layout**: The bottom action bar must accommodate the invert button between the language pickers without wrapping or overflowing horizontally on standard screen sizes (~360–390dp).
4. **Mode isolation during language swap**: Calling `swapLanguages('single')` on a saved conversation from another mode should be blocked cleanly by the controller's origin_mode guard.
5. **Disabled states**: If microphone recording or translation is active, tapping the invert button or logo must do nothing.

---

### Task 1: Verify and Test `swapLanguages` for Single and Conversation Modes

**Files:**
- Modify: `scripts/verify-mobile-chat-controller.mjs`

**Interfaces:**
- Consumes: `createTextChatController(history, flow, translate, idGenerator)`
- Produces: Verified `controller.swapLanguages('single')` and `controller.swapLanguages('conversation')` handling with mode checks and state updates.

- [ ] **Step 1: Write tests for `swapLanguages('single')` and `swapLanguages('conversation')` in `scripts/verify-mobile-chat-controller.mjs`**

Add tests verifying:
- Swapping languages with mode `'single'` successfully swaps `myLanguage` and `theirLanguage` when languages differ.
- Swapping languages with mode `'conversation'` successfully updates conversation languages.
- Swapping languages is blocked when conversation origin_mode differs from the passed mode.
- Swapping languages returns early when `myLanguage === theirLanguage`.

- [ ] **Step 2: Run test script to verify**

Run: `node --import tsx scripts/verify-mobile-chat-controller.mjs`
Expected: Output showing tests ran and passed.

- [ ] **Step 3: Commit**

```bash
git add scripts/verify-mobile-chat-controller.mjs
git commit -m "test: add controller swapLanguages verification for single and conversation modes"
```

---

### Task 2: Implement Language Invert Button in Single View

**Files:**
- Modify: `mobile/src/chat/SingleView.tsx`

**Interfaces:**
- Consumes: `chat.swapLanguages('single')`, `state.myLanguage`, `state.theirLanguage`, `locked`, `isRecording`, `isProcessing`
- Produces: Rendered invert button positioned between the language pickers in `actionsBar` of `SingleView.tsx`.

- [ ] **Step 1: Update `SingleView.tsx` with Invert Button between Language Pickers**

In `mobile/src/chat/SingleView.tsx`:
- Compute `languageControlsDisabled = locked || isRecording || isProcessing`.
- In `actionsBar`, structure the language picker row to place the invert button between the Speak and Listen language pickers:
  ```tsx
  <Pressable
    accessibilityRole="button"
    accessibilityLabel="Invert languages"
    disabled={languageControlsDisabled || state.myLanguage === state.theirLanguage}
    onPress={() => {
      void chat?.swapLanguages('single');
    }}
    style={[
      styles.invertBtn,
      (languageControlsDisabled || state.myLanguage === state.theirLanguage) && styles.disabledBtn,
    ]}
  >
    <Feather name="repeat" size={16} color="#E4E4E7" />
  </Pressable>
  ```
- Add `invertBtn` and `disabledBtn` to `StyleSheet.create` matching `ChatView.tsx`:
  - `invertBtn`: `width: 44`, `height: 44`, `borderRadius: 22`, `borderWidth: 1`, `borderColor: 'rgba(255,255,255,0.10)'`, `backgroundColor: 'rgba(24,24,27,0.75)'`, `alignItems: 'center'`, `justifyContent: 'center'`.
  - `disabledBtn`: `opacity: 0.35`.

- [ ] **Step 2: Run typecheck and lint to verify compilation**

Run: `npm --prefix mobile run typecheck`
Expected: PASS with 0 errors.

Run: `npm --prefix mobile run lint`
Expected: PASS with 0 errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/chat/SingleView.tsx
git commit -m "feat(mobile): add language invert button to single view"
```

---

### Task 3: Implement 360° Spin Animation and Invert on Logo in Conversation View

**Files:**
- Modify: `mobile/src/chat/ConversationView.tsx`

**Interfaces:**
- Consumes: `chat.swapLanguages('conversation')`, `state.myLanguage`, `state.theirLanguage`, `locked`, `isRecording`, `isProcessing`, `isLandscape`
- Produces: Interactive animated center badge in `ConversationView.tsx` that spins 360° and swaps languages on tap.

- [ ] **Step 1: Update `ConversationView.tsx` with Animated 360° Spin and Swap Handler**

In `mobile/src/chat/ConversationView.tsx`:
- Import `Animated` and `Easing` from `'react-native'`.
- Define animation reference:
  ```tsx
  const spinAnim = useRef(new Animated.Value(0)).current;
  const isSpinning = useRef(false);
  ```
- Implement `handleLogoPress`:
  ```tsx
  function handleInvertLanguages() {
    if (locked || isRecording || isProcessing || state.myLanguage === state.theirLanguage) return;
    if (isSpinning.current) return;
    isSpinning.current = true;
    spinAnim.setValue(0);
    Animated.timing(spinAnim, {
      toValue: 1,
      duration: 450,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      isSpinning.current = false;
    });
    void chat?.swapLanguages('conversation');
  }
  ```
- Compute rotation interpolation:
  ```tsx
  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: isLandscape ? ['-90deg', '270deg'] : ['0deg', '360deg'],
  });
  ```
- Update center divider JSX:
  - Change `pointerEvents="none"` on `styles.dividerWrap` to `pointerEvents="box-none"`.
  - Turn `styles.dividerBadge` into a `Pressable`:
    ```tsx
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Invert languages"
      disabled={locked || isRecording || isProcessing || state.myLanguage === state.theirLanguage}
      onPress={handleInvertLanguages}
      style={[
        styles.dividerBadge,
        isLandscape && styles.dividerBadgeLandscape,
        (locked || isRecording || isProcessing || state.myLanguage === state.theirLanguage) && styles.dividerBadgeDisabled,
      ]}
    >
      <Animated.Image
        source={require('../../assets/stringphone-logo.png')}
        resizeMode="contain"
        style={[styles.dividerLogo, { transform: [{ rotate: spin }] }]}
      />
    </Pressable>
    ```
- Add `dividerBadgeDisabled` style with `opacity: 0.6`.

- [ ] **Step 2: Run typecheck and lint to verify compilation**

Run: `npm --prefix mobile run typecheck`
Expected: PASS with 0 errors.

Run: `npm --prefix mobile run lint`
Expected: PASS with 0 errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/chat/ConversationView.tsx
git commit -m "feat(mobile): animate 360 logo spin and invert languages in conversation view"
```

---

### Task 4: End-to-End Verification

**Files:**
- Check: All modified files and test suites

- [ ] **Step 1: Run complete test suite**

Run: `node --import tsx scripts/verify-mobile-chat-controller.mjs`
Run: `npm --prefix mobile run test:local-history`
Run: `npm --prefix mobile run test:phrasebook`
Expected: All tests PASS.

- [ ] **Step 2: Run full typecheck and lint**

Run: `npm --prefix mobile run typecheck`
Run: `npm --prefix mobile run lint`
Expected: Zero type errors, zero lint warnings/errors.

