const config = {
  port: parseInt(process.env.PORT, 10) || 3000,
  db: {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT, 10) || 5432,
    user: process.env.POSTGRES_USER || 'appuser',
    password: process.env.POSTGRES_PASSWORD || 'apppass',
    name: process.env.POSTGRES_DB || 'assessment',
  },
};

module.exports = config;
