# WLAN-Registrierungsportal – Schule Dietlikon

Ein selbst gehostetes Portal zur WLAN-Registrierung mit automatischer UniFi PPSK-Verwaltung. Der Zugang zum Registrierungsformular ist über einen zeitbegrenzten Magic Link geschützt.

## Funktionsübersicht

- **Magic Link Zugang** – Benutzer erhalten per E-Mail einen 24-Stunden-Link zum Registrierungsformular
- **UniFi PPSK** – Automatische Erstellung und Löschung von persönlichen WPA-Schlüsseln (Per-Client PSK)
- **E-Mail-Versand** – Zugangsdaten und QR-Code werden per E-Mail zugestellt
- **Admin-Dashboard** – Übersicht aller Registrierungen, manuelle Deaktivierung möglich
- **Automatischer Cleanup** – Abgelaufene Zugänge werden täglich um 02:00 Uhr deaktiviert
- **Rate Limiting** – Schutz vor Missbrauch (max. 5 Anfragen/Stunde pro IP)

---

## Ablauf

```
WordPress (passwortgeschützt)
  → Formular mit E-Mail-Feld
  → POST an /magic-link/request
  → Magic-Link-E-Mail an Benutzer

Benutzer klickt Link in E-Mail (24h gültig)
  → Registrierungsformular öffnet sich (E-Mail vorausgefüllt)
  → Benutzer füllt Vor-/Nachname, Telefon und Zugangsdauer aus
  → UniFi PPSK wird erstellt
  → WLAN-Passwort + QR-Code per E-Mail zugestellt
```

---

## Technologie

| Komponente | Technologie |
|---|---|
| Backend | Node.js, Express |
| Datenbank | SQLite (better-sqlite3) |
| E-Mail | Nodemailer (SMTP) |
| WLAN | UniFi Network Application (PPSK API) |
| Deployment | Docker / Coolify |

---

## Installation

### Voraussetzungen

- Node.js 20+
- UniFi Network Application mit PPSK-Unterstützung
- SMTP-Zugang (z.B. Outlook, Gmail, eigener Mailserver)

### Lokale Entwicklung

```bash
# Repository klonen
git clone https://github.com/hajfler/wifi-registration.git
cd wifi-registration

# Abhängigkeiten installieren
npm install

# Umgebungsvariablen konfigurieren
cp .env.example .env
# .env mit eigenen Werten befüllen

# Server starten
npm run dev
```

### Docker

```bash
docker build -t wifi-registration .
docker run -d \
  --name wifi-registration \
  -p 3000:3000 \
  -v wifi-data:/app/data \
  --env-file .env \
  wifi-registration
```

---

## Konfiguration (.env)

```env
# Server
PORT=3000
BASE_URL=https://wlan-zugang.schule-dietlikon.ch

# UniFi
UNIFI_URL=https://192.168.1.1
UNIFI_USERNAME=admin
UNIFI_PASSWORD=secret
UNIFI_SITE=default
UNIFI_WLAN_NAME=Schule-Dietlikon-Gast

# SMTP
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=wlan@schule-dietlikon.ch
SMTP_PASS=secret
SMTP_FROM="Schule Dietlikon WLAN <wlan@schule-dietlikon.ch>"

# Admin
ADMIN_PASSWORD=sicheres-passwort
SESSION_SECRET=zufaelliger-langer-string
```

> `BASE_URL` muss korrekt gesetzt sein, damit die Magic-Links in den E-Mails auf die richtige Adresse zeigen.

---

## WordPress-Integration

Auf der passwortgeschützten WordPress-Seite einen **"Benutzerdefiniertes HTML"**-Block einfügen:

```html
<form method="POST" action="https://wlan-zugang.schule-dietlikon.ch/magic-link/request">
  <p>
    <label for="wlan-email"><strong>E-Mail-Adresse</strong></label><br>
    <input type="email" name="email" id="wlan-email" required
           placeholder="deine@email.ch"
           style="width:100%;padding:10px;font-size:16px;border:1px solid #ccc;border-radius:6px;box-sizing:border-box;">
  </p>
  <p>
    <button type="submit"
            style="background:#745BA3;color:#fff;padding:12px 24px;font-size:16px;
                   border:none;border-radius:6px;cursor:pointer;">
      Zugriffslink anfordern
    </button>
  </p>
</form>
```

Nach dem Absenden wird der Benutzer zur Bestätigungsseite weitergeleitet und erhält eine E-Mail mit dem Magic Link.

---

## Routen

| Route | Methode | Beschreibung | Schutz |
|---|---|---|---|
| `/magic-link` | GET | Anfrage-Formular (E-Mail eingeben) | öffentlich |
| `/magic-link/request` | POST | Magic Link generieren und senden | öffentlich, Rate-limited |
| `/` | GET | Registrierungsformular | Magic Link erforderlich |
| `/register` | POST | Registrierung verarbeiten | Magic Link erforderlich |
| `/success.html` | GET | Erfolgsseite | Magic Link erforderlich |
| `/admin` | GET/POST | Admin-Dashboard | Admin-Passwort |

---

## Admin-Dashboard

Erreichbar unter `/admin/login`.

Funktionen:
- Alle Registrierungen anzeigen (Name, E-Mail, Ablaufdatum, Status)
- Zugänge manuell widerrufen (löscht auch den UniFi PPSK)

---

## Zugangsdauer-Optionen

| Wert | Dauer |
|---|---|
| `1d` | 1 Tag |
| `7d` | 1 Woche |
| `30d` | 1 Monat |
| `60d` | 2 Monate |
| `180d` | 6 Monate (Maximum) |

---

## Projektstruktur

```
wifi-registration/
├── server.js                    # Express-Einstiegspunkt
├── Dockerfile
├── package.json
├── public/
│   ├── index.html               # Registrierungsformular
│   ├── magic-link.html          # Magic-Link-Anfrage-Seite
│   ├── success.html             # Erfolgsseite
│   ├── access.html              # (veraltet)
│   └── assets/                  # CSS, Logo
│       ├── style.css
│       └── logo.svg
├── src/
│   ├── db/
│   │   └── database.js          # SQLite-Datenbankschicht
│   ├── middleware/
│   │   ├── auth.js              # Cookie-Hilfsfunktionen
│   │   ├── ipWhitelist.js       # IP-Whitelist (optional, veraltet)
│   │   └── magicLink.js         # Magic-Link-Validierung
│   ├── routes/
│   │   ├── admin.js             # Admin-Dashboard-Routen
│   │   ├── magicLink.js         # Magic-Link-Anfrage-Route
│   │   └── registration.js      # Registrierungs-Route
│   ├── services/
│   │   ├── email.js             # E-Mail-Versand (Nodemailer)
│   │   ├── qrcode.js            # QR-Code-Generierung
│   │   ├── scheduler.js         # Cron-Jobs
│   │   └── unifi.js             # UniFi PPSK API
│   └── templates/
│       ├── email.html           # E-Mail-Template WLAN-Zugangsdaten
│       └── magic-link-email.html # E-Mail-Template Magic Link
└── data/                        # SQLite-Datenbankdatei (Docker Volume)
    └── registrations.db
```
