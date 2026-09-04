# ScroLess 백엔드 컨테이너 이미지
FROM node:20-slim

WORKDIR /app

# 의존성 먼저 설치 (레이어 캐시 활용)
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

# 앱 소스 복사
COPY . .

# 플랫폼이 PORT 를 주입하지 않는 경우의 기본값
ENV PORT=8787
EXPOSE 8787

CMD ["npm", "start"]
