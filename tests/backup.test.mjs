import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BACKUP_STALE_DAYS,
  BACKUP_VERSION,
  backupFileName,
  backupSummary,
  buildBackup,
  daysSinceBackup,
  isBackupStale,
  parseBackup,
} from '../src/js/domain/backup.js';

const MAINTENANT = '2026-08-04T10:00:00.000Z';

const etatFixture = () => ({
  missions: [{ id: 'm1', reference: 'CHF-2608-001' }, { id: 'm2', reference: 'CHF-2608-002' }],
  invoices: [{ id: 'i1', number: 'FA-2026-0001' }],
  creditNotes: [{ id: 'c1', number: 'AV-2026-0001' }],
  settings: { siret: '73282932000074', city: 'Paris' },
  lastQuote: { input: { kilometers: 300 } },
  adminUnlocked: true,
});

test('la sauvegarde contient les données et un décompte vérifiable', () => {
  const sauvegarde = buildBackup(etatFixture(), MAINTENANT);
  assert.equal(sauvegarde.format, 'chanfiou-convoyage');
  assert.equal(sauvegarde.version, BACKUP_VERSION);
  assert.equal(sauvegarde.exportedAt, MAINTENANT);
  assert.deepEqual(sauvegarde.counts, { missions: 2, invoices: 1, creditNotes: 1 });
  assert.equal(sauvegarde.data.missions.length, 2);
  assert.equal(sauvegarde.data.settings.siret, '73282932000074');
});

test('le code d’accès à l’espace n’empêche pas la restauration', () => {
  const sauvegarde = buildBackup(etatFixture(), MAINTENANT);
  assert.equal(sauvegarde.data.adminUnlocked, undefined, 'l’état de session ne se sauvegarde pas');
});

test('un aller-retour sauvegarde puis lecture conserve tout', () => {
  const original = etatFixture();
  const texte = JSON.stringify(buildBackup(original, MAINTENANT));
  const { backup, error } = parseBackup(texte);
  assert.equal(error, undefined);
  assert.deepEqual(backup.data.missions, original.missions);
  assert.deepEqual(backup.data.invoices, original.invoices);
  assert.deepEqual(backup.data.creditNotes, original.creditNotes);
  assert.deepEqual(backupSummary(backup), {
    exportedAt: MAINTENANT,
    missions: 2,
    invoices: 1,
    creditNotes: 1,
  });
});

test('un fichier illisible est refusé avec un message utile', () => {
  const { error } = parseBackup('ceci n’est pas du json');
  assert.match(error, /sauvegarde lisible/);
  assert.match(error, /\.json/);
});

test('un fichier d’une autre application est refusé', () => {
  const { error } = parseBackup(JSON.stringify({ format: 'autre-appli', version: 1, data: {} }));
  assert.match(error, /ne vient pas de cette application/);
});

test('une sauvegarde d’une version future est refusée', () => {
  const { error } = parseBackup(
    JSON.stringify({ format: 'chanfiou-convoyage', version: BACKUP_VERSION + 1, data: {} }),
  );
  assert.match(error, /version plus récente/);
});

test('une sauvegarde sans données est refusée', () => {
  const { error } = parseBackup(JSON.stringify({ format: 'chanfiou-convoyage', version: 1 }));
  assert.match(error, /incomplète/);
});

test('une sauvegarde corrompue nomme la donnée en cause', () => {
  const { error } = parseBackup(
    JSON.stringify({
      format: 'chanfiou-convoyage',
      version: 1,
      data: { missions: 'pas un tableau', invoices: [] },
    }),
  );
  assert.match(error, /corrompue sur missions/);
});

test('une sauvegarde vide mais bien formée est acceptée', () => {
  const { backup, error } = parseBackup(
    JSON.stringify({ format: 'chanfiou-convoyage', version: 1, exportedAt: MAINTENANT, data: { missions: [] } }),
  );
  assert.equal(error, undefined);
  assert.equal(backupSummary(backup).missions, 0);
});

test('le nom du fichier porte la date', () => {
  assert.equal(backupFileName(MAINTENANT), 'chanfiou-sauvegarde-2026-08-04.json');
});

test('l’ancienneté de la sauvegarde est calculée en jours', () => {
  const reference = new Date('2026-08-10T10:00:00.000Z');
  assert.equal(daysSinceBackup('2026-08-10T09:00:00.000Z', reference), 0);
  assert.equal(daysSinceBackup('2026-08-07T10:00:00.000Z', reference), 3);
  assert.equal(daysSinceBackup(null, reference), null);
});

test('une sauvegarde absente ou trop ancienne est signalée', () => {
  const reference = new Date('2026-08-10T10:00:00.000Z');
  assert.equal(isBackupStale(null, 5, reference), true, 'aucune sauvegarde avec des missions');
  assert.equal(isBackupStale(null, 0, reference), false, 'rien à sauvegarder');
  assert.equal(isBackupStale('2026-08-09T10:00:00.000Z', 5, reference), false);
  assert.equal(
    isBackupStale('2026-08-03T10:00:00.000Z', 5, reference),
    true,
    `${BACKUP_STALE_DAYS} jours ou plus doit alerter`,
  );
});
