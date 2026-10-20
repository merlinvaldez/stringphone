import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [variant, ...expoArgs] = process.argv.slice(2);
if (!variant || expoArgs.length === 0) {
  console.error('Usage: node scripts/run-expo-variant.mjs <variant> <expo command> [args...]');
  process.exit(2);
}

const expoCli = fileURLToPath(new URL('../node_modules/expo/bin/cli', import.meta.url));
const mobileRoot = fileURLToPath(new URL('../', import.meta.url));
const childArgs = selectConnectedDevice(expoArgs);
ensureWindowsCmakeStagingDirectory(variant, expoArgs);
const child = spawn(process.execPath, [expoCli, ...childArgs], {
  cwd: mobileRoot,
  env: { ...process.env, APP_VARIANT: variant },
  stdio: 'inherit',
});

child.on('error', (error) => {
  console.error(`Could not start Expo CLI: ${error.message}`);
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});

function ensureWindowsCmakeStagingDirectory(selectedVariant, args) {
  if (process.platform !== 'win32' || selectedVariant !== 'development' || args[0] !== 'run:android') return;

  const directory = 'C:\\sp';
  try {
    if (!existsSync(directory)) mkdirSync(directory);
    if (!statSync(directory).isDirectory()) throw new Error(`${directory} exists but is not a directory.`);
  } catch (error) {
    console.error(`StringPhone's Windows Android build needs the short CMake folder ${directory}. Create it once with Windows permission to write at the drive root. ${error.message}`);
    process.exit(1);
  }
}

function selectConnectedDevice(args) {
  const deviceFlagIndex = args.findIndex((argument) => argument === '--device' || argument === '-d');
  if (deviceFlagIndex < 0 || (args[deviceFlagIndex + 1] && !args[deviceFlagIndex + 1].startsWith('-'))) {
    return args;
  }

  const sdkRoot = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
  const adb = sdkRoot ? join(sdkRoot, 'platform-tools', 'adb.exe') : 'adb';
  const result = spawnSync(adb, ['devices', '-l'], { encoding: 'utf8', windowsHide: true });
  if (result.error || result.status !== 0) return args;

  const devices = result.stdout
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter((fields) => fields.length > 1 && fields[1] === 'device')
    .map((fields) => ({
      serial: fields[0],
      name: fields.find((field) => field.startsWith('model:'))?.slice('model:'.length) ?? fields[0],
    }));

  const selectedSerial = process.env.ANDROID_SERIAL;
  const selected = selectedSerial
    ? devices.find((device) => device.serial === selectedSerial)
    : devices.length === 1 ? devices[0] : undefined;
  if (selected) {
    const selectedArgs = [...args];
    selectedArgs.splice(deviceFlagIndex + 1, 0, selected.name);
    return selectedArgs;
  }

  if (devices.length > 1 && !process.stdin.isTTY) {
    console.error('More than one Android device is connected. Set ANDROID_SERIAL or pass --device <model> to select one.');
    process.exit(2);
  }
  return args;
}
