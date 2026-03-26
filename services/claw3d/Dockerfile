FROM node:20-slim

WORKDIR /app

RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

RUN git clone https://github.com/iamlukethedev/Claw3D.git .

COPY .env .env

RUN npm install

RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
