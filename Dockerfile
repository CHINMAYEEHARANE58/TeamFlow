FROM node:24-alpine AS build
WORKDIR /app
ARG NEXT_PUBLIC_REALTIME_WS_URL
ENV NEXT_PUBLIC_REALTIME_WS_URL=$NEXT_PUBLIC_REALTIME_WS_URL
COPY package*.json ./
RUN npm ci
COPY . .
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN npm run build && npm prune --omit=dev
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3000
CMD ["npm","start"]
