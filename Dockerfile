FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt ./
RUN python3 -m venv .venv && .venv/bin/python -m pip install --no-cache-dir -r requirements.txt
COPY . .
RUN npm run check
ENV NODE_ENV=production HOST=0.0.0.0
EXPOSE 5173
USER node
CMD ["npm", "start"]
