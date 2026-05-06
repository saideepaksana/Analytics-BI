const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3300;
const FILE_PATH = path.join(__dirname, 'index.html');

const server = http.createServer((req, res) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    
    if (req.url === '/' || req.url === '/index.html') {
        fs.readFile(FILE_PATH, (err, data) => {
            if (err) {
                res.writeHead(500);
                res.end('Error loading index.html');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(data);
        });
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${PORT}/`);
});

// Prevent the process from exiting immediately
process.on('SIGINT', () => {
    console.log('Server shutting down');
    server.close();
    process.exit();
});
