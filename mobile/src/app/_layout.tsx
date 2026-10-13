import { StatusBar } from 'expo-status-bar';
import { NativeTabs } from 'expo-router/unstable-native-tabs';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <NativeTabs tintColor="#285B48" backBehavior="initialRoute" disableTransparentOnScrollEdge>
        <NativeTabs.Trigger name="index">
          <NativeTabs.Trigger.Label>Chat</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="single">
          <NativeTabs.Trigger.Label>Single</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="conversation">
          <NativeTabs.Trigger.Label>Conversation</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="phrasebook">
          <NativeTabs.Trigger.Label>Phrasebook</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    </>
  );
}
