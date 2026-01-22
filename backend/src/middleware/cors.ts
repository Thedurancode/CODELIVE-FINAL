import cors from 'cors';

// Parse allowed origins from environment variable
const getAllowedOrigins = (): string[] => {
  const envOrigins = process.env.CORS_ALLOWED_ORIGINS;
  if (envOrigins) {
    return envOrigins.split(',').map(origin => origin.trim());
  }

  // Default origins for development
  if (process.env.NODE_ENV !== 'production') {
    return ['http://localhost:3000', 'http://127.0.0.1:3000'];
  }

  // In production without explicit config, require CORS_ALLOWED_ORIGINS to be set
  console.warn('⚠️  CORS_ALLOWED_ORIGINS not set in production - defaulting to localhost only');
  return ['http://localhost:3000'];
};

export const corsOptions = cors({
  origin: getAllowedOrigins(),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
});