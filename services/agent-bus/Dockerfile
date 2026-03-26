FROM node:20-slim

WORKDIR /app

RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

RUN git clone https://github.com/emiliovos/agent-bus.git .

RUN npm install

EXPOSE 4000 18789

CMD ["npm", "run", "dev:all"]
