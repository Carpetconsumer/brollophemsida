-- O.S.A.-svar. Varje inskickat formulär blir en rad; inget skrivs över.
CREATE TABLE IF NOT EXISTS svar (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  skapad      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  namn        TEXT    NOT NULL,
  epost       TEXT    NOT NULL,
  kommer      INTEGER NOT NULL CHECK (kommer IN (0, 1)),
  fler        TEXT    NOT NULL DEFAULT '',
  mat         TEXT    NOT NULL DEFAULT '',
  halsning    TEXT    NOT NULL DEFAULT '',
  -- bekräftelsemejlet till gästen: 'skickad', 'misslyckad', 'spärrad' (för många till samma adress) eller 'av' (ingen e-post konfigurerad)
  bekraftelse TEXT    NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS svar_epost ON svar (epost);
