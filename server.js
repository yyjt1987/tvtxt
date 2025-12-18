const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

process.on('uncaughtException', (err) => {
  console.error(`未捕获的异常: ${err.message}\n${err.stack}`);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(`未处理的Promise拒绝: ${reason}`);
});

const PORT = 8000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// 确保public文件夹存在
if (!fs.existsSync(PUBLIC_DIR)) {
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  console.log('已创建public目录');
}

// MIME类型映射
const mimeTypes = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'text/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.txt': 'text/plain; charset=UTF-8',
  '.jar': 'application/java-archive',
  '.md5': 'text/plain; charset=UTF-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
  console.log(`${req.method} ${req.url}`);
  
  // 解码URL，处理中文路径
  let decodedUrl = decodeURIComponent(req.url);
  let filePath = path.join(PUBLIC_DIR, decodedUrl);
  
  // 检查路径是否存在
  fs.stat(filePath, (err, stats) => {
    if (err) {
      // 路径不存在，返回404
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
      res.end('404 Not Found');
      return;
    }
    
    // 如果是目录，尝试加载index.html
    if (stats.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
      // 检查目录下是否有index.html
      fs.access(filePath, fs.constants.F_OK, (err) => {
        if (err) {
          // 目录下没有index.html，返回404
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
          res.end('404 Not Found');
          return;
        }
        
        // 读取并返回index.html
        res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
        fs.createReadStream(filePath).pipe(res);
      });
    } else {
      // 如果是文件，直接返回
      const extname = path.extname(filePath);
      const contentType = mimeTypes[extname] || 'application/octet-stream';
      
      res.writeHead(200, { 'Content-Type': contentType });
      fs.createReadStream(filePath).pipe(res);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
  console.log('所有文本文件将使用UTF-8编码返回');
});