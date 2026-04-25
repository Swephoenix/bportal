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

Servern startar på `http://localhost:3005` (eller `PORT` om satt).

## Mejlsändning

Beställningen sparas alltid i `data/orders.json`. Om vald avdelning har en definierad mottagaradress försöker servern även skicka ett mejl och sparar resultatet på ärendet.

Konfigurera e-post via `.env` i projektroten. En mall finns i `.env.example`:

```bash
MAIL_HOST=smtp.example.com
MAIL_USER=anvandare@example.com
MAIL_PASS=losenord
MAIL_FROM=noreply@ambitionsverige.se
MAIL_DEMO_MODE=true
PASSWORD_PARTIET=demo-partiet
PASSWORD_MATERIAL=demo-material
PASSWORD_GRAFISKT_MATERIAL=demo-grafiskt
PASSWORD_MEDLEMSREGISTER=demo-medlemsregister
PASSWORD_IT_SUPPORT=demo-it-support
PASSWORD_HEMSIDA=demo-hemsida
PASSWORD_MARKNAD=demo-marknad
PASSWORD_FACEBOOK=demo-facebook
SMTP_PORT=587
```

För port 465 används TLS direkt. Annars använder servern STARTTLS.
`MAIL_HOST`, `MAIL_USER` och `MAIL_PASS` används som gemensamma standardvärden för både SMTP och IMAP. `MAIL_FROM` är adressen som syns som avsändare i utgående mejl. `PASSWORD_*`-variablerna styr lösenorden för avdelningarna. Du kan fortfarande skriva över värden med `SMTP_*` eller `IMAP_*` om du behöver separata inställningar senare.
`MAIL_DEMO_MODE=true` stänger av faktisk mejlsändning men fortsätter spara beställningar normalt. Sätt `false` eller ta bort raden när du vill skicka riktiga mejl igen.

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

Bilagor sparas som metadata i ärendet, och uppladdade bilder lagras också på servern så att de kan visas i adminpanelen med förhandsvisning.
