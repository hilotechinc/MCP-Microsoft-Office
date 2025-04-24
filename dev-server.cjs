// dev-server.cjs
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');

const app = express();
const PORT = 3000;

// Proxy API requests to backend
app.use('/api', createProxyMiddleware({
  target: 'http://localhost:3001',
  changeOrigin: true,
}));

// Serve static files
app.use(express.static(path.join(__dirname, 'src/renderer')));

// Fallback for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'src/renderer/index.html'));
});

app.listen(PORT, () => {
  console.log(`Frontend (with API proxy) running at http://localhost:${PORT}`);
});
