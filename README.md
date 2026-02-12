# Beställningsportalen (backend-version)

Systemet är nu ett riktigt serverbaserat system med:
- API + sessionhantering (cookie-baserad inloggning)
- Ärenden sparade på servern i `data/orders.json`
- Separata gruppinloggningar (eget konto per avdelning)

## Starta

```bash
npm start
```

Servern startar på `http://localhost:3000` (eller `PORT` om satt).

## Gruppinloggningar (standard)

Skapas automatiskt första gången i `data/users.json`.
Servern skriver ut initiala lösenord i terminalen en gång, vid första skapandet.

Varje konto ser bara ärenden för sin egen grupp.

## Viktiga filer

- `server.js`: server + API + sessioner
- `index.html`: frontend
- `data/orders.json`: lagrade ärenden
- `data/users.json`: inloggningskonton (hashade lösenord)

## Notering

Uppladdade filer sparas som filmetadata (filnamn/storlek) i ärendet.
Själva filinnehållet lagras inte i denna version.
