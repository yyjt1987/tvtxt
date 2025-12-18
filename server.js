const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

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
    // 使用命令行删除public文件夹中的所有内容（更可靠的方式处理嵌套目录）
    execSync(`rm -rf "${PUBLIC_DIR}"/*`, { stdio: 'inherit' });
    console.log('public文件夹清理完成');
  } catch (error) {
    console.error('清理public文件夹失败:', error.message);
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