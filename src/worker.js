// The worker is your process: it long-polls a task queue on the Temporal server
// and executes workflow and activity code. Temporal itself never runs your code.
const { Worker, NativeConnection } = require('@temporalio/worker');
const activities = require('./activities');

const TASK_QUEUE = 'orders';

async function run() {
  const connection = await NativeConnection.connect({ address: process.env.TEMPORAL_ADDRESS || 'localhost:7233' });
  const worker = await Worker.create({
    connection,
    namespace: 'default',
    taskQueue: TASK_QUEUE,
    workflowsPath: require.resolve('./workflows'),
    activities,
  });
  console.log(`Worker polling task queue "${TASK_QUEUE}" — Ctrl+C to stop`);
  await worker.run();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

