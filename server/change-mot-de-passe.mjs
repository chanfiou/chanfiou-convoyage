import { spawn } from 'node:child_process';
import { hashPassword, verifyPassword } from './src/crypto.js';

const password = process.argv[2];

if (!password) {
  console.error('Usage : node change-mot-de-passe.mjs "votre-mot-de-passe"');
  process.exit(1);
}

if (password.length < 12) {
  console.error(`Ce mot de passe fait ${password.length} caractères. Prenez-en au moins 12.`);
  process.exit(1);
}

const hash = await hashPassword(password);
const verified = await verifyPassword(password, hash);

if (!verified) {
  console.error('Anomalie : l’empreinte générée ne se vérifie pas. Rien n’a été envoyé.');
  process.exit(1);
}

console.log('Envoi de l’empreinte au serveur…');

const put = spawn('npx', ['wrangler', 'secret', 'put', 'OPERATOR_PASSWORD_HASH'], {
  stdio: ['pipe', 'inherit', 'inherit'],
  shell: true,
});
put.stdin.write(`${hash}\n`);
put.stdin.end();
put.on('exit', (code) => {
  if (code === 0) console.log('\nMot de passe changé. Reconnectez-vous dans l’Espace convoyeur.');
  process.exit(code ?? 1);
});
