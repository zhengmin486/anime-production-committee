import { existsSync, readdirSync, statSync } from 'node:fs';
import { delimiter, dirname, extname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// Root scripts can delegate here without installing JavaScript dependencies:
// build:wasm -> node scripts/build-core.mjs wasm
// build:native -> node scripts/build-core.mjs native
// test:native -> node scripts/build-core.mjs test
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'packages', 'game-core');
const windows = process.platform === 'win32';
const env = { ...process.env };
const mode = process.argv[2];
const expectedEmcc = env.EMCC_VERSION || '4.0.23';

function pathValue(environment = env) {
  return Object.entries(environment).find(([key]) => key.toLowerCase() === 'path')?.[1] || '';
}

function prependPath(paths) {
  const previous = pathValue();
  for (const key of Object.keys(env)) {
    if (key.toLowerCase() === 'path') delete env[key];
  }
  env.PATH = [...paths, previous].filter(Boolean).join(delimiter);
}

function which(name) {
  const extensions = windows && !extname(name) ? ['.exe', '.cmd', '.bat', ''] : [''];
  const directories = isAbsolute(name) || /[/\\]/.test(name) ? [''] : pathValue().split(delimiter);
  for (const directory of directories) {
    for (const extension of extensions) {
      const candidate = directory ? join(directory.replace(/^"|"$/g, ''), name + extension) : name + extension;
      // emsdk 的 PATH 里存在名为 cmake 的目录；只接受普通文件，避免把目录当可执行文件。
      if (existsSync(candidate) && statSync(candidate).isFile()) return resolve(candidate);
    }
  }
  return undefined;
}

function quoteCmd(value) {
  const text = String(value);
  if (/["\r\n%]/.test(text)) throw new Error(`Unsupported command-shell character in argument: ${text}`);
  return `"${text}"`;
}

function checked(result, label) {
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (result.stderr) process.stderr.write(result.stderr);
    throw new Error(`${label} failed (exit ${result.status ?? result.signal}).`);
  }
  return result.stdout?.trim() || '';
}

function cmd(command, capture = false) {
  return checked(spawnSync(env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', command], {
    cwd: root, env, windowsVerbatimArguments: true,
    encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit',
  }), command);
}

function run(executable, args = [], capture = false) {
  if (windows && /\.(bat|cmd)$/i.test(executable)) {
    return cmd(`call ${[executable, ...args].map(quoteCmd).join(' ')}`, capture);
  }
  return checked(spawnSync(executable, args, {
    cwd: root, env, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit',
  }), executable);
}

function visualStudio() {
  if (!windows) return undefined;
  const vswhere = which('vswhere') || join(env['ProgramFiles(x86)'] || 'C:/Program Files (x86)',
    'Microsoft Visual Studio', 'Installer', 'vswhere.exe');
  if (!existsSync(vswhere)) return undefined;
  return run(vswhere, ['-latest', '-products', '*', '-requires',
    'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-property', 'installationPath'], true) || undefined;
}

function findTool(name, override, fallback) {
  if (override) {
    const found = which(override);
    if (!found) throw new Error(`${name} override does not exist: ${override}`);
    return found;
  }
  const found = which(name) || (fallback && existsSync(fallback) ? fallback : undefined);
  if (!found) throw new Error(`${name} not found. Add it to PATH or install the C++ CMake tools in Visual Studio.`);
  return found;
}

function sdkExecutable(sdk, directory, candidates) {
  const parent = join(sdk, directory);
  if (!existsSync(parent)) return undefined;
  for (const entry of readdirSync(parent, { withFileTypes: true }).filter((item) => item.isDirectory()).reverse()) {
    for (const candidate of candidates) {
      const filename = join(parent, entry.name, candidate);
      if (existsSync(filename)) return filename;
    }
  }
  return undefined;
}

function buildNative(cmake, ninja, studio) {
  const build = join(root, 'build', 'native');
  const commands = [
    [cmake, ['-S', source, '-B', build, '-G', 'Ninja', `-DCMAKE_MAKE_PROGRAM=${ninja}`,
      '-DCMAKE_BUILD_TYPE=Release', '-DBUILD_TESTING=ON']],
    [cmake, ['--build', build, '--parallel']],
  ];
  if (mode === 'test') {
    const ctest = findTool('ctest', env.CTEST_COMMAND, join(dirname(cmake), windows ? 'ctest.exe' : 'ctest'));
    commands.push([ctest, ['--test-dir', build, '--output-on-failure', '--no-tests=error']]);
  }
  if (windows) {
    const devCmd = studio && join(studio, 'Common7', 'Tools', 'VsDevCmd.bat');
    if (!devCmd || !existsSync(devCmd)) {
      if (!env.VSCMD_VER || !which('cl')) {
        throw new Error('MSVC was not found by vswhere. Install Visual Studio C++ tools or use a Developer Command Prompt.');
      }
      for (const [tool, args] of commands) run(tool, args);
      return;
    }
    // Initialize MSVC and configure/build/test in the SAME cmd process; no global PATH changes.
    const initialize = `call ${quoteCmd(devCmd)} -no_logo -arch=x64 -host_arch=x64`;
    const chain = commands.map(([tool, args]) => [tool, ...args].map(quoteCmd).join(' '));
    cmd([initialize, ...chain].join(' && '));
  } else {
    for (const [tool, args] of commands) run(tool, args);
  }
}

function buildWasm(cmake, ninja) {
  const onPath = which('emcmake');
  const localSdk = join(root, '.tools', 'emsdk');
  const sdk = env.EMSDK ? resolve(env.EMSDK) : existsSync(join(localSdk, '.emscripten'))
    ? localSdk : onPath ? resolve(dirname(onPath), '..', '..') : localSdk;
  const emscripten = join(sdk, 'upstream', 'emscripten');
  const emcmake = env.EMSDK || existsSync(join(localSdk, '.emscripten'))
    ? join(emscripten, windows ? 'emcmake.bat' : 'emcmake') : onPath;
  if (!emcmake || !existsSync(emcmake)) {
    throw new Error(`Emscripten ${expectedEmcc} is missing. In .tools/emsdk run: emsdk install ${expectedEmcc}, then emsdk activate --embedded ${expectedEmcc}. Or set EMSDK to an activated SDK.`);
  }
  env.EMSDK = sdk;
  if (!env.EM_CONFIG && existsSync(join(sdk, '.emscripten'))) env.EM_CONFIG = join(sdk, '.emscripten');
  env.EMSDK_NODE = env.EMSDK_NODE || sdkExecutable(sdk, 'node', windows ? ['bin/node.exe', 'node.exe'] : ['bin/node']) || process.execPath;
  env.EMSDK_PYTHON = env.EMSDK_PYTHON || sdkExecutable(sdk, 'python', windows ? ['python.exe'] : ['bin/python3']) || which(windows ? 'python' : 'python3');
  if (!env.EMSDK_PYTHON) throw new Error('Python 3 is required. Set EMSDK_PYTHON or install the SDK Python tool.');
  // Only the child environment changes. Use a matching SDK runtime where available.
  prependPath([dirname(emcmake), dirname(cmake), dirname(ninja), dirname(env.EMSDK_NODE), dirname(env.EMSDK_PYTHON)]);
  const emcc = join(dirname(emcmake), windows ? 'emcc.bat' : 'emcc');
  const version = run(emcc, ['--version'], true);
  if (!version.split('\n')[0].includes(` ${expectedEmcc} `)) {
    throw new Error(`Expected Emscripten ${expectedEmcc}; found ${version.split('\n')[0]}. Activate the pinned version or explicitly set EMCC_VERSION.`);
  }
  console.log(version.split('\n')[0]);
  run(env.EMSDK_NODE, ['--version']);
  run(env.EMSDK_PYTHON, ['--version']);
  const build = join(root, 'build', 'wasm');
  // The real emcmake wrapper selects Emscripten, never MSVC, even on Windows.
  run(emcmake, [cmake, '-S', source, '-B', build, '-G', 'Ninja',
    `-DCMAKE_MAKE_PROGRAM=${ninja}`, '-DCMAKE_BUILD_TYPE=Release', '-DBUILD_TESTING=OFF']);
  run(cmake, ['--build', build, '--parallel']);
  for (const filename of ['game-core.mjs', 'game-core.wasm', 'game-core-v4.mjs', 'game-core-v4.wasm']) {
    if (!existsSync(join(root, 'apps', 'web', 'public', 'wasm', filename))) {
      throw new Error(`Build did not produce ${filename}.`);
    }
  }
}

try {
  if (!['wasm', 'native', 'test'].includes(mode) || process.argv.length !== 3) {
    throw new Error('Usage: node scripts/build-core.mjs wasm|native|test');
  }
  const studio = visualStudio();
  const bundled = studio && join(studio, 'Common7', 'IDE', 'CommonExtensions', 'Microsoft', 'CMake');
  const cmake = findTool('cmake', env.CMAKE_COMMAND, bundled && join(bundled, 'CMake', 'bin', 'cmake.exe'));
  const ninja = findTool('ninja', env.NINJA_COMMAND, bundled && join(bundled, 'Ninja', 'ninja.exe'));
  prependPath([dirname(cmake), dirname(ninja)]);
  run(cmake, ['--version']);
  run(ninja, ['--version']);
  if (mode === 'wasm') buildWasm(cmake, ninja);
  else buildNative(cmake, ninja, studio);
} catch (error) {
  console.error(`build-core: ${error.message}`);
  process.exitCode = 1;
}
