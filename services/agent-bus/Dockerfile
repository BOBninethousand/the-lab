FROM node:20-slim

WORKDIR /app

RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

RUN git clone --depth 1 https://github.com/emiliovos/agent-bus.git .

# Remove claw3d dir if present — dev:all detects it and tries to start
# Claw3D inside this container, causing port 4000 conflict
RUN rm -rf claw3d/

RUN npm install

EXPOSE 4000 18789

CMD ["npm", "run", "dev:all"]
