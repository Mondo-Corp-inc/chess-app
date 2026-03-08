FROM node:22-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
COPY client/package*.json ./client/
COPY server/package*.json ./server/

RUN npm install
RUN cd client && npm install
RUN cd server && npm install

# Copy source
COPY . .

# Build client
RUN cd client && npm run build

# Expose ports
EXPOSE 3000 5173

# Start server (client served from server in production)
CMD ["npm", "start"]
