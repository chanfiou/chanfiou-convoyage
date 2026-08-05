import { hashPassword, randomToken, verifyPassword } from './src/crypto.js';

const password = process.argv[2];

if (!password) {
  console.error('Usage : node genere-mot-de-passe.mjs "votre-mot-de-passe"');
  process.exit(1);
}

if (password.length < 12) {
  console.error(`Ce mot de passe fait ${password.length} caractères. Prenez-en au moins 12.`);
  process.exit(1);
}

const hash = await hashPassword(password);
const verified = await verifyPassword(password, hash);

if (!verified) {
  console.error('Anomalie : l’empreinte générée ne se vérifie pas. Ne l’utilisez pas.');
  process.exit(1);
}

console.log('\nOPERATOR_PASSWORD_HASH à coller :\n');
console.log(hash);
console.log('\nSESSION_SECRET à coller :\n');
console.log(randomToken(48));
console.log('\nNe conservez pas ce mot de passe en clair dans un fichier.\n');
