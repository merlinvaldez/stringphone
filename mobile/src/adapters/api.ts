import { getApiUrl } from '../config/api';
import { createProcessingTransport } from './processingTransport';
import { createTextChatApi } from './textChat';
import { createVoiceChatApi } from './voiceChat';
import { createSpeechApi } from './speech';

// Resolves environment lazily when a request is made, not during module import.
export const nativeProcessingApi = createProcessingTransport(getApiUrl);
export const { translateTextMessage } = createTextChatApi(nativeProcessingApi);
export const { translateVoiceMessage } = createVoiceChatApi(nativeProcessingApi);
export const { requestOutputSpeech } = createSpeechApi(nativeProcessingApi);
export { TextTranslationResponseError } from './textChat';
export { ProcessingApiError } from './processingTransport';
export { createSpeechApi, splitSpeechTextIntoChunks, concatenateWavBuffers, parseWav } from './speech';
