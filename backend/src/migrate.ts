import dataSource from './database/data-source';

async function run() {
  await dataSource.initialize();
  await dataSource.runMigrations();
  await dataSource.destroy();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
