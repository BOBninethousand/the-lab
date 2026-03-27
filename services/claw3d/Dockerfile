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

# 4. Replace AgentChatPanel with HTTP-based chat (The Lab's /api/chat)
# Claw3D's original uses OpenClaw WebSocket protocol which we can't bridge.
# This replacement calls The Lab's API directly via a Next.js API route.
COPY AgentChatPanel.tsx src/features/agents/components/AgentChatPanel.tsx

# 5. Add Next.js API route for lab chat proxy (server-side fetch to The Lab)
RUN mkdir -p src/app/api/lab-chat
COPY lab-chat-route.ts src/app/api/lab-chat/route.ts

# 6. Rebrand office title from Claw3D default to The Lab
RUN sed -i 's/Luke Headquarters/The Lab HQ/g' \
    src/lib/studio/settings.ts \
    src/features/retro-office/RetroOffice3D.tsx \
    src/features/office/components/panels/SettingsPanel.tsx

# 7. Rebrand OpenClaw UI text to The Lab
RUN sed -i \
    -e 's/OpenClaw Event Console/The Lab Event Console/g' \
    -e 's/Live OpenClaw State/Live Agent State/g' \
    -e 's/Live OpenClaw state/Live agent state/g' \
    -e 's/Raw OpenClaw Gateway Events/Raw Gateway Events/g' \
    -e 's/No OpenClaw gateway events/No gateway events/g' \
    -e 's/No OpenClaw events/No events/g' \
    -e 's/record from OpenClaw/record from The Lab/g' \
    -e 's/openclaw-events-/lab-events-/g' \
    src/features/office/screens/OfficeScreen.tsx && \
  sed -i \
    -e 's/Focused operator studio for the OpenClaw gateway\./The Lab — AI Agent Operations Hub/' \
    src/app/layout.tsx && \
  sed -i \
    -e 's/your OpenClaw agents/your AI agents/g' \
    -e 's/your OpenClaw gateway/your agent gateway/g' \
    -e 's/Claw3D turns your AI automation/The Lab turns your AI automation/g' \
    -e "s/This wizard will help you connect to your agent gateway and get started in about two minutes\./Explore the 3D office where your agents work, collaborate, and execute tasks./" \
    src/features/onboarding/components/WelcomeStep.tsx && \
  sed -i \
    -e 's/Welcome to Claw3D/Welcome to The Lab/g' \
    -e 's/Your AI office in 3D/Your AI operations hub/g' \
    -e 's/Link to your OpenClaw instance/Auto-connected via Docker/g' \
    src/features/onboarding/types.ts

# 8. Rebrand onboarding steps 2-5 for The Lab
RUN sed -i \
    -e 's/OpenClaw installed/The Lab Backend/g' \
    -e 's/Install via npm, pnpm, or from source/FastAPI running on port 8000/g' \
    -e 's/Gateway running/Agent Bus/g' \
    -e 's/Start with: openclaw gateway start/Hub and gateway auto-connected/g' \
    -e 's/openclaw gateway start/docker-compose up/g' \
    -e 's/Gateway URL and token/Bridge Service/g' \
    -e "s|Found in ~/.openclaw/openclaw.json or your remote setup|Syncing events to 3D Office|g" \
    -e 's/Node.js 20+/3D Office/g' \
    -e 's/Required for running Claw3D locally/Rendering the AI workspace/g' \
    -e "s/Make sure you have these ready before connecting. If you already have OpenClaw running, you can skip this step./All services run automatically in Docker. No manual setup needed./" \
    -e 's/docs.openclaw.ai/docker-compose/g' \
    -e 's/join Discord/auto-deploy/g' \
    -e "s/Need help? Check /All services managed by /g" \
    src/features/onboarding/components/PrerequisitesStep.tsx && \
  sed -i \
    -e 's/Claw3D fleet sidebar/the Office sidebar/g' \
    src/features/onboarding/components/AgentsStep.tsx && \
  sed -i \
    -e 's/re-run onboarding from Studio settings/re-run onboarding from Office settings/g' \
    src/features/onboarding/components/CompleteStep.tsx

# --- Build ---

# Build-time env (NEXT_PUBLIC_* baked into Next.js client bundle)
RUN printf 'NEXT_PUBLIC_GATEWAY_URL=ws://agent-bus:18789\nDEBUG=true\nPORT=3000\n' > .env

RUN npm install

ENV NODE_OPTIONS="--max-old-space-size=1024"
RUN npm run build

ENV HOST=0.0.0.0
ENV PORT=3000

# Pre-configure gateway connection so Claw3D auto-connects (skips onboarding screen)
# Claw3D reads from ~/.openclaw/claw3d/settings.json at startup
RUN mkdir -p /root/.openclaw/claw3d && \
    printf '{"gateway":{"url":"ws://agent-bus:18789","token":"agent-bus"}}\n' > /root/.openclaw/claw3d/settings.json

EXPOSE 3000

CMD ["npm", "start"]
