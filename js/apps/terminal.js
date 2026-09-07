/* ==========================================================================
   terminal.js

   The shell was the strongest part of the original and its behaviour is kept
   intact. What changed is the shape:

     · commands are records with `usage` and `summary`, so `help` and `man`
       are generated rather than being a hand-maintained wall of println()
       calls that drifted out of step with the commands themselves
     · every command receives an `io` object instead of reaching for a global
       `out` element
     · tab completion, for commands and for paths
     · `open`/`exit` publish events rather than calling into the shell, which
       keeps this module free of any dependency on which skin is running
   ========================================================================== */

import { h, fill, on } from '../core/dom.js';
import { emit, system, setHost, uptimeShort } from '../core/state.js';
import {
  fs, resolve, nodeAt, isDir, isFile, parentOf, pretty, homePath,
  usedBytes, cloneNode, isValidName, touched,
} from '../fs/filesystem.js';
import { ACCENTS, WALLPAPERS, setAccent, setWallpaper } from '../ui/theme.js';

const MAX_SCROLLBACK = 400;

export function createTerminal() {
  let cwd = homePath();
  const history = [];
  let historyIndex = 0;
  let draft = '';

  const output = h('div.term-out');
  const ps1 = h('span.term-ps1');
  const input = h('input.term-in', {
    autocomplete: 'off',
    autocapitalize: 'off',
    autocorrect: 'off',
    spellcheck: false,
    'aria-label': 'Shell input',
  });

  const element = h('div.app-root',
    h('div.term',
      output,
      h('div.term-line', ps1, input),
    ),
  );

  /* ---------------------------------------------------------------- output */

  const io = {
    print(text = '', className) {
      const line = h('div', className ? { class: className } : null);
      line.textContent = text;
      output.appendChild(line);

      // The original never trimmed scrollback. A long `tree` or a few hundred
      // commands left thousands of nodes in the document, and every later
      // append had to lay all of them out again.
      while (output.childElementCount > MAX_SCROLLBACK) output.firstElementChild.remove();

      output.scrollTop = output.scrollHeight;
    },
    lines(list, className) {
      for (const line of list) io.print(line, className);
    },
    clear() {
      fill(output);
    },
  };

  const fail = (text) => io.print(text, 'err');

  function setPrompt() {
    ps1.textContent = `${pretty(cwd)}$`;
  }

  /* -------------------------------------------------------------- commands */

  /** Read a single file argument, reporting the usual errors. */
  function readFile(name, command) {
    if (!name) {
      fail(`${command}: missing file operand`);
      return null;
    }
    const node = nodeAt(resolve(name, cwd));
    if (node === null) {
      fail(`${command}: ${name}: no such file or directory`);
      return null;
    }
    if (isDir(node)) {
      fail(`${command}: ${name}: is a directory`);
      return null;
    }
    return node;
  }

  function copyOrMove(args, command) {
    const [from, to] = args;
    if (!from || !to) return fail(`usage: ${command} <source> <destination>`);

    const source = resolve(from, cwd);
    const node = nodeAt(source);
    if (node === null) return fail(`${command}: ${from}: no such file or directory`);

    const destination = resolve(to, cwd);
    const destinationNode = nodeAt(destination);
    const intoDirectory = isDir(destinationNode);

    const parent = intoDirectory ? destinationNode : nodeAt(destination.slice(0, -1));
    const name = intoDirectory ? source[source.length - 1] : destination[destination.length - 1];

    if (!isDir(parent)) return fail(`${command}: ${to}: not a directory`);
    if (!isValidName(name)) return fail(`${command}: ${name}: invalid name`);

    // Moving a directory inside itself would detach the whole subtree.
    if (isDir(node) && destination.join('/').startsWith(source.join('/'))) {
      return fail(`${command}: cannot move '${from}' into itself`);
    }

    parent[name] = cloneNode(node);
    if (command === 'mv') {
      const { parent: oldParent, name: oldName } = parentOf(source);
      delete oldParent[oldName];
    }
    touched();
  }

  function headOrTail(args, command) {
    const content = readFile(args[0], command);
    if (content === null) return;
    const lines = content.replace(/\n$/, '').split('\n');
    io.lines(command === 'head' ? lines.slice(0, 10) : lines.slice(-10));
  }

  const commands = {
    help: {
      usage: 'help',
      summary: 'list every command',
      run() {
        const names = Object.keys(commands).sort();
        const width = Math.max(...names.map((n) => n.length));
        io.print('');
        for (const name of names) {
          io.print(`  ${name.padEnd(width + 3)}${commands[name].summary}`);
        }
        io.print('');
        io.print('  Tab completes commands and paths. Up and down walk history.', 'dim');
      },
    },

    man: {
      usage: 'man <command>',
      summary: 'show usage for one command',
      run([name]) {
        const command = commands[name];
        if (!command) return fail(`man: no entry for ${name || '(nothing)'}`);
        io.print(`  ${command.usage}`);
        io.print(`  ${command.summary}`, 'dim');
      },
    },

    ls: {
      usage: 'ls [directory]',
      summary: 'list directory contents',
      run([target]) {
        const path = target ? resolve(target, cwd) : cwd;
        const node = nodeAt(path);
        if (node === null) return fail(`ls: ${target}: no such file or directory`);
        if (isFile(node)) return io.print(target);

        const names = Object.keys(node).sort();
        if (!names.length) return io.print('  (empty)', 'dim');
        io.print(`  ${names.map((n) => (isDir(node[n]) ? `${n}/` : n)).join('   ')}`);
      },
    },

    cd: {
      usage: 'cd [directory]',
      summary: 'change the working directory',
      run([target]) {
        if (!target) {
          cwd = homePath();
          return setPrompt();
        }
        const path = resolve(target, cwd);
        const node = nodeAt(path);
        if (node === null) return fail(`cd: ${target}: no such file or directory`);
        if (!isDir(node)) return fail(`cd: ${target}: not a directory`);
        cwd = path;
        setPrompt();
      },
    },

    pwd: {
      usage: 'pwd',
      summary: 'print the working directory',
      run() { io.print(`/${cwd.join('/')}`); },
    },

    cat: {
      usage: 'cat <file>',
      summary: 'print a file',
      run([name]) {
        const content = readFile(name, 'cat');
        if (content === null) return;
        io.print(content.replace(/\n$/, '') || '(empty file)');
      },
    },

    head: { usage: 'head <file>', summary: 'first ten lines of a file', run: (a) => headOrTail(a, 'head') },
    tail: { usage: 'tail <file>', summary: 'last ten lines of a file',  run: (a) => headOrTail(a, 'tail') },

    wc: {
      usage: 'wc <file>',
      summary: 'count lines, words and bytes',
      run([name]) {
        const content = readFile(name, 'wc');
        if (content === null) return;
        const lines = content ? content.replace(/\n$/, '').split('\n').length : 0;
        const words = content.split(/\s+/).filter(Boolean).length;
        io.print(`  ${lines}  ${words}  ${content.length}  ${name}`);
      },
    },

    grep: {
      usage: 'grep <pattern> <file>',
      summary: 'find lines matching a pattern',
      run([pattern, name]) {
        if (!pattern || !name) return fail('usage: grep <pattern> <file>');
        const content = readFile(name, 'grep');
        if (content === null) return;
        const needle = pattern.toLowerCase();
        const hits = content.split('\n').filter((line) => line.toLowerCase().includes(needle));
        if (!hits.length) return io.print('  (no matches)', 'dim');
        io.lines(hits);
      },
    },

    tree: {
      usage: 'tree [directory]',
      summary: 'show the tree below a directory',
      run([target]) {
        const path = target ? resolve(target, cwd) : cwd;
        const node = nodeAt(path);
        if (!isDir(node)) return fail(`tree: ${target || pretty(path)}: not a directory`);

        let directories = 0;
        let files = 0;
        io.print(pretty(path));

        (function walk(current, prefix) {
          const names = Object.keys(current).sort();
          names.forEach((name, index) => {
            const last = index === names.length - 1;
            const child = current[name];
            io.print(`${prefix}${last ? '└── ' : '├── '}${name}${isDir(child) ? '/' : ''}`);
            if (isDir(child)) {
              directories += 1;
              walk(child, `${prefix}${last ? '    ' : '│   '}`);
            } else {
              files += 1;
            }
          });
        })(node, '');

        io.print('');
        io.print(`${directories} directories, ${files} files`, 'dim');
      },
    },

    mkdir: {
      usage: 'mkdir <directory>',
      summary: 'create a directory',
      run([target]) {
        if (!target) return fail('mkdir: missing operand');
        const path = resolve(target, cwd);
        const { parent, name } = parentOf(path);
        if (!isDir(parent)) return fail(`mkdir: ${target}: no such directory`);
        if (!isValidName(name)) return fail(`mkdir: ${name}: invalid name`);
        if (Object.hasOwn(parent, name)) return fail(`mkdir: ${target}: already exists`);
        parent[name] = {};
        touched();
      },
    },

    touch: {
      usage: 'touch <file>',
      summary: 'create an empty file',
      run([target]) {
        if (!target) return fail('touch: missing operand');
        const { parent, name } = parentOf(resolve(target, cwd));
        if (!isDir(parent)) return fail(`touch: ${target}: no such directory`);
        if (!isValidName(name)) return fail(`touch: ${name}: invalid name`);
        if (!Object.hasOwn(parent, name)) {
          parent[name] = '';
          touched();
        }
      },
    },

    rm: {
      usage: 'rm <path>',
      summary: 'remove a file or directory',
      run([target]) {
        if (!target) return fail('rm: missing operand');
        const path = resolve(target, cwd);
        if (!path.length) return fail('rm: refusing to remove /');
        const { parent, name } = parentOf(path);
        if (!isDir(parent) || !Object.hasOwn(parent, name)) {
          return fail(`rm: ${target}: no such file or directory`);
        }
        delete parent[name];
        touched();
      },
    },

    write: {
      usage: 'write <file> <text…>',
      summary: 'write text to a file, replacing it',
      run(args) {
        const [target, ...rest] = args;
        if (!target || !rest.length) return fail('usage: write <file> <text…>');
        const { parent, name } = parentOf(resolve(target, cwd));
        if (!isDir(parent)) return fail(`write: ${target}: no such directory`);
        if (isDir(parent[name])) return fail(`write: ${target}: is a directory`);
        parent[name] = `${rest.join(' ')}\n`;
        touched();
        io.print(`wrote ${parent[name].length} B to ${target}`, 'dim');
      },
    },

    cp: { usage: 'cp <source> <destination>', summary: 'copy a file or directory', run: (a) => copyOrMove(a, 'cp') },
    mv: { usage: 'mv <source> <destination>', summary: 'move or rename',            run: (a) => copyOrMove(a, 'mv') },

    echo:   { usage: 'echo <text…>', summary: 'print text',              run: (a) => io.print(a.join(' ')) },
    whoami: { usage: 'whoami',       summary: 'print the current user',  run: () => io.print(system.user) },
    date:   { usage: 'date',         summary: 'print the date and time', run: () => io.print(new Date().toString()) },
    clear:  { usage: 'clear',        summary: 'clear the screen',        run: () => io.clear() },

    uptime: {
      usage: 'uptime',
      summary: 'how long since this interface booted',
      run() {
        const load = (0.04 + (new Date().getSeconds() % 7) / 100).toFixed(2);
        io.print(`  up ${uptimeShort()},  load average: ${load}`);
      },
    },

    uname: {
      usage: 'uname [-a]',
      summary: 'print system information',
      run([flag]) {
        io.print(flag === '-a'
          ? `gazéifié ${system.host} 6.9.0-arm64 #1 SMP handheld arm64`
          : 'gazéifié');
      },
    },

    hostname: {
      usage: 'hostname [name]',
      summary: 'show or set the hostname',
      run([name]) {
        if (!name) return io.print(system.host);
        if (!/^[a-z0-9-]{1,32}$/i.test(name)) {
          return fail('hostname: letters, digits and hyphens only');
        }
        setHost(name.toLowerCase());
        fs.etc.hostname = `${system.host}\n`;
        touched();
        io.print(`hostname set to ${system.host}`, 'dim');
      },
    },

    ps: {
      usage: 'ps',
      summary: 'list running processes',
      run() {
        io.print('  PID TTY      TIME      CMD');
        for (const [pid, tty, time, cmd] of [
          ['1', '?', '00:00:01', 'init'],
          ['42', 'tty1', '00:00:00', 'compositor'],
          ['77', 'tty1', '00:00:00', 'sh'],
          ['98', 'tty1', '00:00:00', 'ps'],
        ]) {
          io.print(`  ${pid.padStart(3)} ${tty.padEnd(8)} ${time}  ${cmd}`);
        }
      },
    },

    df: {
      usage: 'df',
      summary: 'show filesystem usage',
      run() {
        const capacity = 65536;
        const used = usedBytes();
        const percent = Math.round((used / capacity) * 100);
        io.print('Filesystem     Size    Used   Avail  Use%  Mounted on');
        io.print(
          `tmpfs          64K   ${String(used).padStart(5)}B  ` +
          `${String(capacity - used).padStart(5)}B  ${String(percent).padStart(3)}%  /`,
        );
      },
    },

    neofetch: {
      usage: 'neofetch',
      summary: 'system summary with a logo',
      run() {
        const memory = navigator.deviceMemory ? `${navigator.deviceMemory}G` : '6G';
        io.lines([
          `   ,----.     ${system.user}@${system.host}`,
          '  / .--. \\    ─────────────────────',
          ` | |    | |   os      gazéifié 1.0`,
          ` | |    | |   kernel  6.9.0-arm64`,
          `  \\ '--' /    shell   sh`,
          `   '----'     memory  ${memory}`,
          `              screen  ${screen.width}×${screen.height}`,
          `              uptime  ${uptimeShort()}`,
        ]);
      },
    },

    history: {
      usage: 'history',
      summary: 'show recent commands',
      run() {
        if (!history.length) return io.print('  (nothing yet)', 'dim');
        history.forEach((line, index) => {
          io.print(`  ${String(index + 1).padStart(3)}  ${line}`);
        });
      },
    },

    accent: {
      usage: 'accent <name>',
      summary: 'change the accent colour',
      run([name]) {
        const found = ACCENTS.find((a) => a.id === (name || '').toLowerCase());
        if (!found) return fail(`accent: choose one of ${ACCENTS.map((a) => a.id).join(', ')}`);
        setAccent(found.id);
        io.print(`accent set to ${found.name.toLowerCase()}`, 'dim');
      },
    },

    wallpaper: {
      usage: 'wallpaper <name>',
      summary: 'change the background',
      run([name]) {
        const found = WALLPAPERS.find((w) => w.id === (name || '').toLowerCase());
        if (!found) return fail(`wallpaper: choose one of ${WALLPAPERS.map((w) => w.id).join(', ')}`);
        setWallpaper(found.id);
        io.print(`background set to ${found.name.toLowerCase()}`, 'dim');
      },
    },

    open: {
      usage: 'open <app>',
      summary: 'launch an app',
      run([name]) {
        if (!name) return fail('open: which app?');
        emit('app:launch', { id: name.toLowerCase(), source: 'terminal' });
      },
    },

    browse: {
      usage: 'browse <url>',
      summary: 'open a site in a real browser tab',
      run([url = 'https://www.youtube.com']) {
        const target = /^https?:\/\//i.test(url) ? url : `https://${url}`;
        io.print(`opening ${target}…`, 'dim');
        emit('external:open', target);
      },
    },

    sudo: {
      usage: 'sudo <command…>',
      summary: 'attempt to elevate privileges',
      run(args) {
        io.print('this incident has been reported.', 'warn');
        if (args.length) io.print(`(you own this device — just run \`${args.join(' ')}\`)`, 'dim');
      },
    },

    exit: {
      usage: 'exit',
      summary: 'close the terminal',
      run() {
        io.print('logging out…', 'dim');
        setTimeout(() => emit('app:close', { id: 'terminal' }), 320);
      },
    },
  };

  /* ------------------------------------------------------------ completion */

  /** Complete a command name, or a path once there is a command. */
  function complete(value) {
    const parts = value.split(/\s+/);
    const word = parts[parts.length - 1] ?? '';

    const candidates = parts.length <= 1
      ? Object.keys(commands).filter((name) => name.startsWith(word))
      : completePath(word);

    if (!candidates.length) return null;

    if (candidates.length === 1) {
      const [only] = candidates;
      parts[parts.length - 1] = only;
      return parts.join(' ');
    }

    // More than one match: print the options and extend to the shared prefix,
    // which is what a real shell does and what muscle memory expects.
    io.print(`${pretty(cwd)}$ ${value}`, 'echo');
    io.print(`  ${candidates.join('   ')}`, 'dim');

    const shared = candidates.reduce((prefix, candidate) => {
      let index = 0;
      while (index < prefix.length && prefix[index] === candidate[index]) index += 1;
      return prefix.slice(0, index);
    });
    if (shared.length <= word.length) return null;
    parts[parts.length - 1] = shared;
    return parts.join(' ');
  }

  function completePath(word) {
    const slash = word.lastIndexOf('/');
    const directoryPart = slash === -1 ? '' : word.slice(0, slash + 1);
    const stem = slash === -1 ? word : word.slice(slash + 1);

    const node = nodeAt(resolve(directoryPart || '.', cwd));
    if (!isDir(node)) return [];

    return Object.keys(node)
      .filter((name) => name.startsWith(stem))
      .sort()
      .map((name) => `${directoryPart}${name}${isDir(node[name]) ? '/' : ''}`);
  }

  /* ---------------------------------------------------------------- runner */

  function run(raw) {
    const line = raw.trim();
    io.print(`${pretty(cwd)}$ ${line}`, 'echo');
    if (!line) return;

    if (history[history.length - 1] !== line) history.push(line);
    historyIndex = history.length;

    const [name, ...args] = line.split(/\s+/);
    const command = commands[name];
    if (command) {
      try {
        command.run(args, io);
      } catch (error) {
        fail(`${name}: ${error.message}`);
        console.error(error);
      }
    } else {
      fail(`${name}: command not found. Try \`help\`.`);
    }
  }

  /* -------------------------------------------------------------- bindings */

  on(input, 'keydown', (event) => {
    switch (event.key) {
      case 'Enter':
        run(input.value);
        input.value = '';
        draft = '';
        break;

      case 'ArrowUp':
        event.preventDefault();
        if (!history.length) return;
        if (historyIndex === history.length) draft = input.value;
        historyIndex = Math.max(0, historyIndex - 1);
        input.value = history[historyIndex];
        break;

      case 'ArrowDown':
        event.preventDefault();
        if (historyIndex >= history.length) return;
        historyIndex += 1;
        input.value = historyIndex === history.length ? draft : history[historyIndex];
        break;

      case 'Tab': {
        event.preventDefault();
        const completed = complete(input.value);
        if (completed !== null) input.value = completed;
        break;
      }

      default:
        if (event.key === 'l' && event.ctrlKey) {
          event.preventDefault();
          io.clear();
        } else if (event.key === 'c' && event.ctrlKey) {
          event.preventDefault();
          io.print(`${pretty(cwd)}$ ${input.value}^C`, 'echo');
          input.value = '';
        }
    }
  });

  // Clicking anywhere in the console focuses the input — but not while a
  // selection is being made, or copying output becomes impossible.
  on(output, 'click', () => {
    if (!String(getSelection() ?? '')) input.focus();
  });

  setPrompt();
  io.print(fs.etc.motd.trim(), 'dim');
  io.print('');

  return {
    element,
    subtitle: () => pretty(cwd),
    onShow() {
      setTimeout(() => input.focus({ preventScroll: true }), 60);
    },
    onHide() {
      input.blur();
    },
  };
}
