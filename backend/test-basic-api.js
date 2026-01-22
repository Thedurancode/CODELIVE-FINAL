// Basic API test without database connection
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const app = express();
const PORT = 3002; // Use different port to avoid conflicts

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Basic routes
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    message: 'Basic API test successful'
  });
});

app.get('/api/test', (req, res) => {
  res.json({
    success: true,
    message: 'API is working correctly',
    framework: 'Express',
    nodeVersion: process.version,
    environment: process.env.NODE_ENV || 'development'
  });
});

app.get('/', (req, res) => {
  res.json({
    message: 'Dispotree Basic API Test',
    endpoints: {
      health: '/api/health',
      test: '/api/test'
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: 'The requested resource was not found'
  });
});

console.log(`Basic API test server starting on port ${PORT}`);
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});