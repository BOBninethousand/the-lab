FROM node:20-slim

WORKDIR /app

# Install git for clone
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

# Clone Claw3D
RUN git clone --depth 1 https://github.com/iamlukethedev/Claw3D.git .

# --- Patches (applied before build) ---

# 1. Bypass public-host security check — internal Docker deployment, no token needed
# Source: server/network-policy.js line 74: "if (!isPublicHost(host)) return;"
# Makes assertPublicHostAllowed() always return immediately
RUN sed -i 's/if (!isPublicHost(host)) return;/return;/' server/network-policy.js

# 2. Set basePath so all routes/assets serve under /claw3d/
# Source: next.config.ts is empty: "const nextConfig: NextConfig = {};"
RUN sed -i 's/const nextConfig: NextConfig = {};/const nextConfig: NextConfig = { basePath: "\/claw3d" };/' next.config.ts

# 3. Fix client-side WebSocket URL to use basePath prefix
# Source: src/lib/gateway/proxy-url.ts hardcodes "/api/gateway/ws"
RUN sed -i 's|/api/gateway/ws|/claw3d/api/gateway/ws|' src/lib/gateway/proxy-url.ts

# --- Build ---

# Build-time env (NEXT_PUBLIC_* baked into Next.js client bundle)
RUN printf 'NEXT_PUBLIC_GATEWAY_URL=ws://agent-bus:18789\nDEBUG=true\nPORT=3000\n' > .env

RUN npm install

ENV NODE_OPTIONS="--max-old-space-size=1024"
RUN npm run build

ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

CMD ["npm", "start"]
