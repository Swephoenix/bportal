# Beställningsportalen (backend-version)

Systemet är nu ett riktigt serverbaserat system med:
- API + sessionhantering (cookie-baserad inloggning)
- Ärenden sparade på servern i `data/orders.json`
- Mejlrouting för avdelningar med definierad mottagaradress
- Separata avdelningsinloggningar med avdelningsval och lösenord

## Starta

```bash
npm start
```

Servern startar på `http://localhost:3000` (eller `PORT` om satt).

## Mejlsändning

Beställningen sparas alltid i `data/orders.json`. Om vald avdelning har en definierad mottagaradress försöker servern även skicka ett mejl och sparar resultatet på ärendet.

Konfigurera SMTP via miljövariabler:

```bash
SMTP_HOST=smtp.example.com \
SMTP_PORT=587 \
SMTP_USER=anvandare@example.com \
SMTP_PASS=losenord \
SMTP_FROM=noreply@ambitionsverige.se \
npm start
```

För port 465 används TLS direkt. Annars använder servern STARTTLS.

## Gruppinloggningar (standard)

Skapas automatiskt första gången i `data/users.json`.
Som demo återställer servern avdelningarnas lösenord och skriver ut dem i terminalen vid varje start.

Varje avdelning väljs från en dropdown i admininloggningen och ser bara sina egna ärenden.

## Viktiga filer

- `server.js`: server + API + sessioner
- `index.html`: frontend
- `data/orders.json`: lagrade ärenden
- `data/users.json`: inloggningskonton (hashade lösenord)

## Notering

Uppladdade filer sparas som filmetadata (filnamn/storlek) i ärendet.
Själva filinnehållet lagras inte i denna version.
