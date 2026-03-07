FROM node:20-alpine

# Nicht als root laufen
RUN addgroup -S app && adduser -S app -G app

WORKDIR /app

# Dependencies zuerst (besseres Layer-Caching)
COPY package*.json ./
RUN npm ci --omit=dev

# App-Code kopieren
COPY . .

# Datenbank-Verzeichnis anlegen und Berechtigungen setzen
RUN mkdir -p /app/data && chown -R app:app /app

USER app

EXPOSE 3000

# Volume für persistente SQLite-Datenbank
VOLUME ["/app/data"]

CMD ["node", "server.js"]
