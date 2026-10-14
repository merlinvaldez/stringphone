import { getApiUrl } from '../config/api';
import { createProcessingTransport } from './processingTransport';

// Resolves environment lazily when a request is made, not during module import.
export const nativeProcessingApi = createProcessingTransport(getApiUrl);
export { ProcessingApiError } from './processingTransport';
