FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Vite default port is 5173
EXPOSE 5173

# Use --host to make it accessible outside the container
CMD ["npm", "run", "dev", "--", "--host"]
