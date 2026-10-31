FROM node:20-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node . .
RUN mkdir -p public/uploads && chown -R node:node public/uploads

USER node
EXPOSE 3000
CMD ["node", "server.js"]
