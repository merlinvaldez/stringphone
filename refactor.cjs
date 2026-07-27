const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'client', 'src', 'StringPhoneApp.jsx');
let content = fs.readFileSync(filePath, 'utf8');
let lines = content.split('\n');

const exportTargets = [
  'function StringPhoneBrand',
  'function LanguageSelector',
  'function AudioWave',
  'function ErrorNotice',
  'function usesChatOnlyTextLanguage',
  'function useRecorder',
  'function useCountdown',
  'function SharedRoomControls'
];

lines = lines.map(line => {
  for (const target of exportTargets) {
    if (line.startsWith(target)) {
      return line.replace('function', 'export function');
    }
  }
  return line;
});

function removeLinesBetween(lines, startText, endText, inclusiveStart = true, inclusiveEnd = true) {
  let startIndex = lines.findIndex(l => l.startsWith(startText));
  if (startIndex === -1) throw new Error(`Not found start: ${startText}`);
  let endIndex = lines.findIndex((l, i) => i > startIndex && l.startsWith(endText));
  if (endIndex === -1) throw new Error(`Not found end: ${endText}`);
  
  const actualStart = inclusiveStart ? startIndex : startIndex + 1;
  const actualEnd = inclusiveEnd ? endIndex : endIndex - 1;
  
  lines.splice(actualStart, actualEnd - actualStart + 1);
  return lines;
}

lines = removeLinesBetween(lines, 'async function parseApiError', 'export function useRecorder', true, false);
lines = removeLinesBetween(lines, 'function formatTimestamp', 'function getLanguageOption', true, false);
lines = removeLinesBetween(lines, 'function formatPronunciationGuide', 'function getInitialJoinToken', true, false);

// First chunk of chat components
lines = removeLinesBetween(lines, 'function MessageStatusPill', 'const TranscriptCard = React.forwardRef(', true, false);

// Second chunk of chat components
lines = removeLinesBetween(lines, 'function ChatHeader', 'export default function StringPhoneApp', true, false);

// Add imports
const imports = `
import { ChatScreen } from './components/chat/ChatScreen.jsx';
import { translateTextMessage, translateVoiceMessage } from './chatApi.js';
import { formatTimestamp, formatDuration, formatPronunciationGuide } from './utils.js';
`;

const lastImportIndex = lines.findLastIndex(l => l.startsWith('import '));
lines.splice(lastImportIndex + 1, 0, imports.trim());

fs.writeFileSync(filePath, lines.join('\n'));
console.log('Refactoring complete.');
