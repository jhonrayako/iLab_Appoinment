import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import http from 'node:http';

const rolePaths = {
  visitor: '/',
  staff: '/staff/login',
  admin: '/admin/login',
};

const role = process.argv[2] || 'visitor';
const path = rolePaths[role];

if (!path) {
  console.error(`Unknown role: ${role}`);
  process.exit(1);
}

const port = 5173;
const backendUrl = 'http://localhost:5000/api/health';
const url = `http://localhost:${port}${path}`;
let vite;
let backend;
const edgeCandidates = [
  process.env.LOCALAPPDATA && `${process.env.LOCALAPPDATA}\\Microsoft\\Edge\\Application\\msedge.exe`,
  process.env['PROGRAMFILES(X86)'] && `${process.env['PROGRAMFILES(X86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
  process.env.ProgramFiles && `${process.env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
  'msedge',
].filter(Boolean);
const edgeExecutable = edgeCandidates.find((candidate) => candidate === 'msedge' || existsSync(candidate));

function openEdge() {
  if (!edgeExecutable) {
    console.error('Microsoft Edge was not found. Install Edge or add it to PATH.');
    return;
  }

  const edge = spawn(edgeExecutable, [url], { detached: true, stdio: 'ignore' });
  edge.unref();
}

function isAvailable(targetUrl) {
  return new Promise((resolve) => {
    const request = http.get(targetUrl, (response) => {
      response.resume();
      resolve(response.statusCode < 500);
    });
    request.setTimeout(1000, () => {
      request.destroy();
      resolve(false);
    });
    request.on('error', () => resolve(false));
  });
}

function waitForVite() {
  const request = http.get(`http://localhost:${port}`, () => {
    openEdge();
  });

  request.on('error', () => {
    setTimeout(waitForVite, 250);
  });
}

process.on('SIGINT', () => {
  vite?.kill();
  backend?.kill();
  process.exit(0);
});

async function runRole() {
  const [viteAvailable, backendAvailable] = await Promise.all([
    isAvailable(`http://localhost:${port}`),
    isAvailable(backendUrl),
  ]);

  if (!viteAvailable) {
    vite = spawn('npm', ['run', 'frontend'], { stdio: 'inherit', shell: true });
    vite.on('error', (error) => {
      console.error(`Unable to start Vite: ${error.message}`);
      process.exit(1);
    });
  }

  if (!backendAvailable) {
    backend = spawn('npm', ['run', 'backend'], { stdio: 'inherit', shell: true });
    backend.on('error', (error) => console.error(`Unable to start the backend: ${error.message}`));
  }

  if (viteAvailable) openEdge();
  else waitForVite();
}

runRole();