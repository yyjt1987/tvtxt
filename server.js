const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 设置日志文件（放在public目录下）
const LOG_DIR = path.join(__dirname, 'public', 'logs');
const LOG_FILE = path.join(LOG_DIR, `app_${new Date().toISOString().split('T')[0]}.log`);

// 重定向console的输出到自定义日志函数
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

// 确保日志目录存在
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// 创建日志文件写入流
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });

// 重写console.log和console.error方法
console.log = (...args) => {
  const timestamp = new Date().toISOString();
  const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ');
  const logMessage = `[${timestamp}] [INFO] ${message}`;
  
  // 使用原始console.log输出到控制台
  originalConsoleLog(logMessage);
  
  // 写入日志文件
  logStream.write(logMessage + '\n');
};

console.error = (...args) => {
  const timestamp = new Date().toISOString();
  const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ');
  const logMessage = `[${timestamp}] [ERROR] ${message}`;
  
  // 使用原始console.error输出到控制台
  originalConsoleError(logMessage);
  
  // 写入日志文件
  logStream.write(logMessage + '\n');
};

// 在程序退出时关闭日志流
process.on('exit', () => {
  logStream.end();
});

process.on('uncaughtException', (err) => {
  console.error(`未捕获的异常: ${err.message}\n${err.stack}`);
  logStream.end();
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
}

// 检查public文件夹中是否有内容
let hasContent = false;
try {
  const files = fs.readdirSync(PUBLIC_DIR);
  hasContent = files.length > 0;
} catch (error) {
  console.error('检查public文件夹内容失败:', error.message);
}

if (hasContent) {
  console.log('public文件夹中有内容，开始清理...');
  try {
    // 使用rsync命令清理public文件夹内容，排除logs目录
    // 首先创建一个空目录作为源
    const emptyDir = path.join(__dirname, 'empty_dir');
    if (!fs.existsSync(emptyDir)) {
      fs.mkdirSync(emptyDir);
    }
    
    // 使用rsync同步空目录到public目录，排除logs目录
    execSync(`rsync -av --delete --exclude='logs' "${emptyDir}/" "${PUBLIC_DIR}/"`, { stdio: 'inherit' });
    
    // 删除临时空目录
    fs.rmdirSync(emptyDir);
    
    console.log('public文件夹清理完成');
  } catch (error) {
    console.error('清理public文件夹失败:', error.message);
    
    // 如果rsync命令失败，尝试使用备选方法：移动logs目录后删除再移动回来
    try {
      const tempLogsDir = path.join(__dirname, 'temp_logs');
      
      // 如果logs目录存在，先移动到临时位置
      if (fs.existsSync(LOG_DIR)) {
        fs.renameSync(LOG_DIR, tempLogsDir);
      }
      
      // 删除public目录下所有内容
      execSync(`rm -rf "${PUBLIC_DIR}"/*`, { stdio: 'inherit' });
      
      // 如果有临时logs目录，移回public目录
      if (fs.existsSync(tempLogsDir)) {
        fs.renameSync(tempLogsDir, LOG_DIR);
      }
      
      console.log('使用备选方法清理public文件夹完成');
    } catch (error2) {
      console.error('备选方法清理public文件夹也失败:', error2.message);
    }
  }
}

// 定义异步函数下载GitHub文件
async function downloadFromGitHub() {
  console.log('正在从GitHub下载最新文件...');
  try {
    // 直接使用HTTP下载方式
    const zipUrl = 'https://github.com/kimwang1978/tvbox/archive/refs/heads/main.zip';
    const zipPath = path.join(__dirname, 'temp_download.zip');
    const extractPath = path.join(__dirname, 'temp_extract');
    
    // 下载zip文件
    console.log('正在下载zip文件...');
    const zipFile = fs.createWriteStream(zipPath);
    
    // 使用https模块下载文件，处理重定向
    const downloadPromise = new Promise((resolve, reject) => {
      const download = (url) => {
        https.get(url, (response) => {
          // 处理重定向
          if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
            console.log(`跟随重定向: ${response.headers.location}`);
            download(response.headers.location);
            return;
          }
          
          if (response.statusCode !== 200) {
            reject(new Error(`下载失败，状态码: ${response.statusCode}`));
            return;
          }
          
          response.pipe(zipFile);
          
          zipFile.on('finish', () => {
            zipFile.close();
            resolve();
          });
          
          zipFile.on('error', (err) => {
            zipFile.close();
            fs.unlinkSync(zipPath);
            reject(err);
          });
        }).on('error', (err) => {
          zipFile.close();
          fs.unlinkSync(zipPath);
          reject(err);
        });
      };
      
      // 开始下载
      download(zipUrl);
    });
    
    // 等待下载完成
    await downloadPromise;
    console.log('zip文件下载完成');
    
    // 检查是否有unzip命令
    let hasUnzip = false;
    try {
      execSync('unzip -v', { stdio: 'ignore' });
      hasUnzip = true;
    } catch (e) {
      console.log('系统没有unzip命令，将使用Node.js内置方法解压');
    }
    
    if (hasUnzip) {
      // 使用unzip命令解压
      execSync(`mkdir -p "${extractPath}"`, { stdio: 'inherit' });
      execSync(`unzip -q "${zipPath}" -d "${extractPath}"`, { stdio: 'inherit' });
      
      // 找到解压后的文件夹（通常是仓库名-分支名）
      const extractedFolders = fs.readdirSync(extractPath);
      if (extractedFolders.length === 0) {
        throw new Error('解压失败，没有找到解压后的文件');
      }
      
      const repoFolder = path.join(extractPath, extractedFolders[0]);
      
      // 将文件复制到public文件夹
      execSync(`cp -r "${repoFolder}"/* "${PUBLIC_DIR}/"`, { stdio: 'inherit' });
      
      // 清理临时文件
      execSync(`rm -rf "${zipPath}" "${extractPath}"`, { stdio: 'inherit' });
    } else {
      // 如果没有unzip命令，使用Node.js的zlib模块（需要安装adm-zip包）
      console.log('尝试使用Node.js内置方法解压...');
      try {
        // 动态导入adm-zip包
        const AdmZip = (await import('adm-zip')).default;
        
        // 解压zip文件
        const zip = new AdmZip(zipPath);
        zip.extractAllTo(extractPath, true);
        
        // 找到解压后的文件夹
        const extractedFolders = fs.readdirSync(extractPath);
        if (extractedFolders.length === 0) {
          throw new Error('解压失败，没有找到解压后的文件');
        }
        
        const repoFolder = path.join(extractPath, extractedFolders[0]);
        
        // 将文件复制到public文件夹
        execSync(`cp -r "${repoFolder}"/* "${PUBLIC_DIR}/"`, { stdio: 'inherit' });
        
        // 清理临时文件
        execSync(`rm -rf "${zipPath}" "${extractPath}"`, { stdio: 'inherit' });
      } catch (e) {
        // 如果没有安装adm-zip，提示用户安装
        console.error('解压失败，建议安装unzip命令或adm-zip包');
        // 清理临时文件
        if (fs.existsSync(zipPath)) {
          fs.unlinkSync(zipPath);
        }
        if (fs.existsSync(extractPath)) {
          execSync(`rm -rf "${extractPath}"`, { stdio: 'inherit' });
        }
        throw e;
      }
    }
   console.log('从GitHub下载文件完成');
  } catch (error) {
    console.error('从GitHub下载文件失败:', error.message);
  }
}

// 调用异步函数下载文件
downloadFromGitHub();

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