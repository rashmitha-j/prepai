# PrepAI Node backend. g++ is included so the local "process" code runner works;
# for stronger isolation use CODE_RUNNER=docker with a dedicated judge host.
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends g++ util-linux ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY src ./src

ENV NODE_ENV=production PORT=5000
EXPOSE 5000
USER node
CMD ["node", "src/server.js"]
