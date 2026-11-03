# Placeholder until Milestone 2 (Next.js). Serves a static notice so the stack starts.
FROM node:22-alpine
WORKDIR /srv/web
COPY web/public ./public
EXPOSE 3000
CMD ["npx", "--yes", "serve@14.2.4", "-l", "3000", "public"]
