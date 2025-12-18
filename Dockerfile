# 使用Node.js官方镜像作为基础镜像
FROM node:16-alpine

# 设置工作目录
WORKDIR /app

# 复制package.json和package-lock.json（如果存在）
COPY package*.json ./

# 安装依赖
RUN npm install --production

# 复制项目文件
COPY server.js ./
COPY public ./public

# 暴露端口
EXPOSE 8000

# 设置启动命令
CMD ["node", "server.js"]