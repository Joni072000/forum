# Forum für den FiveM-Server

Eigenes Forum im Stil großer RP-Server-Foren. Die Website läuft auf GitHub Pages, Daten und Konten liegen im Supabase-Projekt „Forum“.

## Aufbau
- `index.html`, `style.css`, `app.js`: die Website (ohne Build-Schritt)
- `vendor/supabase.js`: Supabase-Bibliothek (lokal, kein CDN nötig)
- `supabase/functions/`: Server-Funktionen
  - `register`: legt Konten mit Benutzername + Passwort an
  - `admin-user`: Passwort zurücksetzen und Konto löschen (nur Verwaltung)

## Rechte
Die Rechte werden in der Datenbank geprüft (Row Level Security), nicht nur im Browser.
- **Stufe** eines Rangs: Höhere Zahl bedeutet mehr Rechte. Foren-Einstellungen wie „ab Moderator“ richten sich danach.
- **Moderieren**: Status setzen, schließen, anheften, verschieben, Beiträge bearbeiten und löschen
- **Verwalten**: Zugriff auf die Verwaltung. Ränge und Mitglieder lassen sich nur unterhalb der eigenen Stufe ändern.

## Wichtig
- Im kostenlosen Supabase-Tarif pausiert das Projekt nach etwa 7 Tagen ohne Aufrufe. Dann im Supabase-Dashboard auf „Restore“ klicken.
- Passwort vergessen: In der Verwaltung unter „Mitglieder“ ein neues Passwort setzen.
