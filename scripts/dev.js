import { spawn } from 'node:child_process';

const processes = [
  spawn('node', ['server/index.js'], {
    shell: true,
    stdio: 'inherit',
  }),
  spawn('vite', ['--host', '127.0.0.1'], {
    shell: true,
    stdio: 'inherit',
  }),
];

function shutdown() {
  for (const child of processes) {
    child.kill();
  }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

for (const child of processes) {
  child.on('exit', (code) => {
    if (code && code !== 0) {
      shutdown();
      process.exit(code);
    }
  });
}
