FROM node:20-slim

WORKDIR /app

# Install git for clone
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

# Clone Claw3D
RUN git clone --depth 1 https://github.com/iamlukethedev/Claw3D.git .

# Patch Next.js config — serve all routes under /claw3d prefix
# Verified: next.config.ts is empty: { const nextConfig: NextConfig = {} }
RUN sed -i 's/const nextConfig: NextConfig = {};/const nextConfig: NextConfig = { basePath: "\/claw3d" };/' next.config.ts

# Patch client-side WebSocket URL to include basePath
# Verified: proxy-url.ts has one hardcoded path: /api/gateway/ws
RUN sed -i 's|/api/gateway/ws|/claw3d/api/gateway/ws|' src/lib/gateway/proxy-url.ts

# Build-time env (NEXT_PUBLIC_* gets baked into Next.js bundle)
RUN printf 'NEXT_PUBLIC_GATEWAY_URL=ws://agent-bus:18789\nDEBUG=true\nPORT=3000\n' > .env

# Install deps (no --ignore-scripts, native deps may need postinstall)
RUN npm install

# Limit Node.js memory for M1 compatibility and build
ENV NODE_OPTIONS="--max-old-space-size=1024"
RUN npm run build

# Runtime env
ENV STUDIO_ACCESS_TOKEN=thelab-claw3d-internal
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

CMD ["npm", "start"]
