FROM node:20-alpine

ENV NODE_ENV=production \
    PORT=3000

WORKDIR /app

# Copier package.json + scripts nécessaires au postinstall
COPY package*.json ./
COPY scripts ./scripts

# Installation des dépendances
RUN npm ci --omit=dev

# Copier le reste du code
COPY . .

EXPOSE 3000
CMD ["npm", "run", "dev:web"]