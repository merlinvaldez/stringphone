import { getApiUrl } from '../config/api';
import { createProcessingTransport } from './processingTransport';
import { createTextChatApi } from './textChat';

// Resolves environment lazily when a request is made, not during module import.
export const nativeProcessingApi = createProcessingTransport(getApiUrl);
export const { translateTextMessage } = createTextChatApi(nativeProcessingApi);
export { TextTranslationResponseError } from './textChat';
export { ProcessingApiError } from './processingTransport';
