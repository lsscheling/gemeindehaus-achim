FROM node:18-alpine
WORKDIR /app

# Backend dependencies
COPY backend/package*.json ./
RUN npm install

# Backend source
COPY backend/*.js ./

# Statisches Frontend ins Container-Dateisystem kopieren
RUN mkdir -p /app/public/js
COPY *.html /app/public/
COPY js/*.js /app/public/js/

EXPOSE 3000
CMD ["npm", "start"]
