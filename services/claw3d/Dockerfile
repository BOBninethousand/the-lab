FROM node:20-slim

WORKDIR /app

# Install git for clone
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

# Clone Claw3D
RUN git clone --depth 1 https://github.com/iamlukethedev/Claw3D.git .

# Env config (inline to avoid COPY issues with .gitignore)
RUN printf 'NEXT_PUBLIC_GATEWAY_URL=ws://agent-bus:18789\nSTUDIO_ACCESS_TOKEN=thelab-claw3d-internal\nDEBUG=true\nPORT=3000\n' > .env

# Install deps
RUN npm install --ignore-scripts

# Limit Node.js memory for M1 compatibility and build
ENV NODE_OPTIONS="--max-old-space-size=1024"
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
