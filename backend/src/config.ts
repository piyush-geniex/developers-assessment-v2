export default () => ({
  port: parseInt(process.env.POSTGRES_PORT, 10) || 3000,
  database: {
    host: process.env.POSTGRES_SERVER,
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    username: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB,
  },
  settlement: {
    defaultRate: 20.0,
    batchSize: 50,
  },
  jwtSecret: process.env.JWT_SECRET,
});