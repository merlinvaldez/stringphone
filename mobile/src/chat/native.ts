import { openNativeHistoryDatabase } from '../adapters/storage';
import { createNativeAudioFiles } from '../adapters/files';
import { translateTextMessage } from '../adapters/api';
import { createAudioStorage } from '../storage/audio';
import { createHistoryRepository } from '../storage/history';
import { createSavedMessageFlow } from '../storage/processing';
import { createTextChatController } from './controller';
import { createDeletionService } from '../storage/deletion';
import { confirmNativeDeletion } from '../adapters/deletionConfirmation';

// Local IDs are never credentials or cloud ownership IDs.
let sequence = 0;
const newId = () => `${Date.now().toString(36)}_${(++sequence).toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
let session: Promise<ReturnType<typeof createTextChatController>> | undefined;
export function getNativeTextChat() {
  // One connection/flow per app lifetime: tab navigation never reruns recovery.
  session ??= (async () => {
    const database = await openNativeHistoryDatabase();
    try {
      const history = createHistoryRepository(database);
      const audio = createAudioStorage(database, createNativeAudioFiles(), newId);
      const deletion = createDeletionService(database, audio, confirmNativeDeletion);
      const controller = createTextChatController(history, createSavedMessageFlow(history, audio), translateTextMessage, newId, undefined, deletion);
      await controller.initialize();
      return controller;
    } catch (error) {
      await database.closeAsync().catch(() => undefined);
      throw error;
    }
  })().catch(error => { session = undefined; throw error; });
  return session;
}
