import { useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, TextInput } from 'react-native';
import { Screen } from '../components/Screen';

export default function ChatScreen() {
  const [draft, setDraft] = useState('');

  return (
    <Screen title="Chat" description="Your conversations will appear here. Translation and saved history are coming in later steps.">
      <Text nativeID="draft-label" style={styles.label}>Message draft</Text>
      <TextInput
        accessibilityLabel="Message draft"
        accessibilityHint="Try typing a message. Sending and saving are not available yet."
        placeholder="Type a message…"
        placeholderTextColor="#66736C"
        value={draft}
        onChangeText={setDraft}
        multiline
        textAlignVertical="top"
        style={styles.input}
      />
      <Pressable accessibilityRole="button" accessibilityLabel="Dismiss keyboard" onPress={Keyboard.dismiss} style={styles.button}>
        <Text style={styles.buttonText}>Done typing</Text>
      </Pressable>
      <Text style={styles.note}>This draft is temporary and is cleared when the app closes.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { color: '#182A23', fontSize: 18, fontWeight: '600' },
  input: { minHeight: 120, borderWidth: 1, borderColor: '#66736C', borderRadius: 12, padding: 16, fontSize: 18, color: '#182A23', backgroundColor: '#FFFFFF' },
  button: { minHeight: 48, justifyContent: 'center', alignItems: 'center', borderRadius: 12, backgroundColor: '#285B48', padding: 12 },
  buttonText: { color: '#FFFFFF', fontSize: 18, fontWeight: '600' },
  note: { color: '#48574F', fontSize: 16 },
});
