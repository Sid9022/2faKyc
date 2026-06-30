import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const certDir = path.join(__dirname, '..', '.dev-certs');
const keyPath = path.join(certDir, 'key.pem');
const certPath = path.join(certDir, 'cert.pem');

if (!fs.existsSync(certDir)) {
  fs.mkdirSync(certDir, { recursive: true });
}

console.log('Generating development certificates...');

try {
  let opensslPath = 'openssl';

  if (os.platform() === 'win32') {
    // Try to find Git's openssl.exe first on Windows
    const gitPathCandidates = [
      'C:\\Program Files\\Git\\usr\\bin\\openssl.exe',
      'C:\\Program Files (x86)\\Git\\usr\\bin\\openssl.exe',
      'C:\\Program Files\\Git\\mingw64\\bin\\openssl.exe',
      path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Git', 'usr', 'bin', 'openssl.exe')
    ];

    for (const p of gitPathCandidates) {
      if (fs.existsSync(p)) {
        opensslPath = `"${p}"`;
        break;
      }
    }
  }

  // Check if openssl is available
  try {
    execSync(`${opensslPath} version`);
  } catch (err) {
    console.error('Error: OpenSSL is not installed or not in PATH.');
    console.error('Please install OpenSSL (e.g., via Git for Windows) and ensure it is in your PATH.');
    process.exit(1);
  }

  // Generate a self-signed certificate
  const command = `${opensslPath} req -x509 -nodes -days 365 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" -subj "/CN=localhost"`;
  execSync(command, { stdio: 'inherit' });
  
  console.log('Certificates generated successfully.');
  console.log(`Key: ${keyPath}`);
  console.log(`Cert: ${certPath}`);
} catch (error) {
  console.error('Failed to generate certificates:', error.message);
  process.exit(1);
}
