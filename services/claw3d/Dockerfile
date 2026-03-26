FROM node:20-slim

WORKDIR /app

RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

RUN git clone https://github.com/iamlukethedev/Claw3D.git .

RUN printf 'NEXT_PUBLIC_GATEWAY_URL=ws://agent-bus:18789\nDEBUG=true\nHOST=0.0.0.0\nPORT=3000\n' > .env

RUN npm install

RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
