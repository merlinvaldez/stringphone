import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const mobileRoot = fileURLToPath(new URL('../', import.meta.url));
const env = { ...process.env, APP_VARIANT: 'development', EXPO_PUBLIC_APP_ENV: 'preview', EXPO_NO_DOTENV: '1' };
const envFile = join(mobileRoot, '.env.local');
const previewUrl = readEnvValue(envFile, 'EXPO_PUBLIC_API_URL_PREVIEW');
if (!previewUrl) {
  console.error('Set EXPO_PUBLIC_API_URL_PREVIEW in mobile/.env.local before building the standalone APK.');
  process.exit(1);
}
env.EXPO_PUBLIC_API_URL_PREVIEW = previewUrl;

const adb = findAdb();
const devicesResult = spawnSync(adb, ['devices'], { encoding: 'utf8', windowsHide: true });
if (devicesResult.error || devicesResult.status !== 0) {
  console.error(`Could not query Android devices with ADB: ${devicesResult.error?.message ?? devicesResult.stderr}`);
  process.exit(1);
}
const devices = devicesResult.stdout.split(/\r?\n/).slice(1)
  .map((line) => line.trim().split(/\s+/))
  .filter((parts) => parts.length > 1 && parts[1] === 'device')
  .map((parts) => parts[0]);
const serial = process.env.ANDROID_SERIAL || (devices.length === 1 ? devices[0] : undefined);
if (!serial || !devices.includes(serial)) {
  console.error(devices.length === 0
    ? 'No authorized Android device found. Connect the phone, allow USB debugging, then rerun.'
    : `Choose one of these devices by setting ANDROID_SERIAL: ${devices.join(', ')}`);
  process.exit(1);
}

const expoCli = join(mobileRoot, 'node_modules', 'expo', 'bin', 'cli');
if (!existsSync(expoCli)) {
  console.error('Mobile dependencies are missing. Run npm.cmd --prefix mobile ci first.');
  process.exit(1);
}

// Generate/synchronize the ignored native project locally. This does not start Metro or use EAS.
if (run(process.execPath, [expoCli, 'prebuild', '--platform', 'android'], { cwd: mobileRoot, env }) !== 0) {
  process.exit(1);
}

const androidRoot = join(mobileRoot, 'android');
const gradleWrapper = join(androidRoot, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
if (!existsSync(gradleWrapper)) {
  console.error(`Android Gradle wrapper not found: ${gradleWrapper}`);
  process.exit(1);
}

let initScript;
if (process.platform === 'win32') {
  const shortBuildRoot = 'C:\\sp';
  mkdirSync(shortBuildRoot, { recursive: true });
  initScript = join(shortBuildRoot, 'stringphone-local-build.gradle');
  writeFileSync(initScript, `allprojects { project ->
    if (project.path != ':' && project.path != ':app') {
      def safePath = project.path.replace(':', '_')
      project.buildDir = new File('C:/sp/gradle' + safePath)
    }
  }\n`);
}

const gradleArgs = ['app:assembleRelease', '--no-daemon', '--max-workers=2', '-PreactNativeArchitectures=arm64-v8a'];
if (initScript) gradleArgs.push('--init-script', initScript);
const gradleCommand = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : gradleWrapper;
const gradleCommandArgs = process.platform === 'win32'
  ? ['/d', '/s', '/c', `"${gradleWrapper}" ${gradleArgs.join(' ')}`]
  : gradleArgs;
if (run(gradleCommand, gradleCommandArgs, { cwd: androidRoot, env }) !== 0) process.exit(1);

const apkPath = join(androidRoot, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
if (!existsSync(apkPath)) {
  console.error(`Gradle completed but the APK was not found: ${apkPath}`);
  process.exit(1);
}

if (run(adb, ['-s', serial, 'install', '-r', apkPath], { cwd: mobileRoot, env }) !== 0) process.exit(1);
console.log(`Installed standalone APK on ${serial}: ${apkPath}`);

function readEnvValue(path, key) {
  if (!existsSync(path)) return undefined;
  const line = readFileSync(path, 'utf8').split(/\r?\n/).find((entry) => entry.trim().startsWith(`${key}=`));
  return line?.slice(line.indexOf('=') + 1).trim().replace(/^['"]|['"]$/g, '') || undefined;
}

function findAdb() {
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (sdk) {
    const sdkAdb = join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
    if (existsSync(sdkAdb)) return sdkAdb;
  }
  return process.platform === 'win32' ? 'adb.exe' : 'adb';
}

function run(command, args, options) {
  const result = spawnSync(command, args, { ...options, stdio: 'inherit', windowsHide: true });
  if (result.error) {
    console.error(`Could not run ${command}: ${result.error.message}`);
    return 1;
  }
  return result.status ?? 1;
}
