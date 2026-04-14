export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  database: {
    host: process.env.POSTGRES_HOST ?? 'localhost',
    port: parseInt(process.env.POSTGRES_PORT ?? '5432', 10),
    username: process.env.POSTGRES_USER ?? 'appuser',
    password: process.env.POSTGRES_PASSWORD ?? 'apppass',
    database: process.env.POSTGRES_DB ?? 'assessment',
  },
});
