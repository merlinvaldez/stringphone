# Single View Invert Button & Conversation View Logo 360 Spin Design

## Intent & Why
Provide quick, intuitive language swapping across voice modes with design parity:
- In **Single View**, allow users to invert their spoken and listened languages without reopening a dropdown or switching modes.
- In **Conversation View**, turn the central StringPhone divider badge into an interactive tactile affordance: tapping it triggers a 360° spin animation and inverts the top and bottom participant languages.

## Goals & Non-Goals
- **Goals**:
  - Add the invert languages button to `SingleView.tsx` matching the `ChatView.tsx` button design (`Feather name="repeat"`, 44x44 circular button) positioned between the two language pickers in the bottom action area.
  - Make the center logo badge in `ConversationView.tsx` tappable, animating a 360° spin (using React Native `Animated`) and calling `chat.swapLanguages('conversation')`.
  - Maintain landscape layout correctness in `ConversationView.tsx` (preserving the -90° base orientation).
  - Ensure full accessibility labels and disabled states while recording or translating.
- **Non-Goals**:
  - Altering speech transcription, translation services, or database schemas.
  - Changing Chat mode or Phrasebook behaviors.
- **Anti-Goals**:
  - No touch interference on Conversation View split halves (`dividerWrap` uses `pointerEvents="box-none"` so only the badge intercepts taps).
  - No layout jitter or wrapping when the invert button is rendered in Single View.

## Approaches
- **Approach 1 (Selected)**:
  - Single View: Place the invert button directly between the language pickers in `actionsBar`, keeping the swap control directly adjacent to the two pickers being swapped.
  - Conversation View: Wrap the center logo in an animated pressable badge, driving a 360° rotation via `Animated.timing` with native driver and triggering `chat.swapLanguages('conversation')`.
- **Approach 2 (Rejected)**:
  - Single View: Placing the invert button in the top header row (`historyRow`). Rejected because the language pickers in Single View live at the bottom, creating a confusing spatial disconnect.

## Implementation Details

### 1. `SingleView.tsx`
- Layout:
  - In `styles.actionsBar`, insert the invert button between the Speak and Listen columns, or place the two `LanguagePicker` controls in a bottom row with the invert button between them:
    `[ My Language Picker ] [ Invert Button ] [ Their Language Picker ]`
  - Button styling matches `styles.headerIconBtn` from `ChatView.tsx`: 44x44, circular, border `rgba(255,255,255,0.10)`, background `rgba(24,24,27,0.75)`, `<Feather name="repeat" size={16} color="#E4E4E7" />`.
- Interaction:
  - Calls `chat?.swapLanguages('single')`.
  - Disabled when `locked || isRecording || isProcessing || state.myLanguage === state.theirLanguage`.
  - Proper accessibility role (`button`) and label (`Invert languages`).

### 2. `ConversationView.tsx`
- Layout:
  - Change `styles.dividerWrap` from `pointerEvents="none"` to `pointerEvents="box-none"` on the container so the divider line does not block taps, but the badge receives touch events.
  - Make `dividerBadge` a `Pressable` with `accessibilityRole="button"` and `accessibilityLabel="Invert languages"`.
- Animation:
  - `spinAnim = useRef(new Animated.Value(0)).current`.
  - On tap:
    - Check if disabled (`locked || isRecording || isProcessing || state.myLanguage === state.theirLanguage`).
    - Reset `spinAnim.setValue(0)` and run `Animated.timing(spinAnim, { toValue: 1, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start()`.
    - Logo rotation interpolation:
      - Portrait: `['0deg', '360deg']`.
      - Landscape: `['-90deg', '270deg']` (or animate `dividerLogo` inside rotated badge).
    - Call `chat?.swapLanguages('conversation')`.

