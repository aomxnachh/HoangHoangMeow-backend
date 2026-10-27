FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-alpine

WORKDIR /app

COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/package*.json ./
RUN npm ci --omit=dev

EXPOSE 4000
ENV PORT=4000

CMD ["node", "dist/index.js"]