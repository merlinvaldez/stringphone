import { useEffect, useState } from 'react';
import { getNativeTextChat } from '../chat/native';
import { INITIAL_CHAT_STATE } from '../chat/controller';
import { ConversationView } from '../chat/ConversationView';

export default function ConversationScreen() {
  const [chat, setChat] = useState<Awaited<ReturnType<typeof getNativeTextChat>> | null>(null);
  const [state, setState] = useState(INITIAL_CHAT_STATE);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | undefined;
    getNativeTextChat()
      .then(controller => {
        if (!mounted) return;
        setChat(controller);
        unsubscribe = controller.subscribe(setState);
      })
      .catch(() => {
        if (mounted) {
          setLoadError('Local history could not be opened. Restart the app to try again.');
        }
      });
    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, []);

  return <ConversationView chat={chat} state={state} loadError={loadError} />;
}
