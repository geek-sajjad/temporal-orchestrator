// The client talks to the Temporal server: it starts workflows, sends signals,
// and runs queries. It can be any process — a web API, a CLI, a cron job.
//
//   node src/client.js start [amount]   start an order (amount > 100 needs approval)
//   node src/client.js approve <id>     send the approve signal
//   node src/client.js reject <id>      send the reject signal
//   node src/client.js status <id>      query live workflow state
const { Client, Connection } = require('@temporalio/client');
const { orderWorkflow, approveSignal, rejectSignal, statusQuery } = require('./workflows');

const TASK_QUEUE = 'orders';

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  const connection = await Connection.connect({ address: process.env.TEMPORAL_ADDRESS || 'localhost:7233' });
  const client = new Client({ connection, namespace: 'default' });

  switch (cmd) {
    case 'start': {
      const amount = Number(arg ?? 250);
      const orderId = `order-${Date.now()}`;
      const handle = await client.workflow.start(orderWorkflow, {
        taskQueue: TASK_QUEUE,
        workflowId: orderId, // business ID — Temporal guarantees one running workflow per ID
        args: [{ orderId, items: ['keyboard', 'mouse'], amount }],
      });
      console.log(`Started ${handle.workflowId}  (amount $${amount})`);
      console.log(`UI: http://localhost:8233/namespaces/default/workflows/${handle.workflowId}`);
      if (amount > 100) console.log(`Needs approval →  npm run approve -- ${orderId}`);
      console.log('Waiting for result...');
      console.log('Result:', await handle.result());
      break;
    }
    case 'approve':
    case 'reject': {
      await client.workflow.getHandle(arg).signal(cmd === 'approve' ? approveSignal : rejectSignal);
      console.log(`Sent "${cmd}" signal to ${arg}`);
      break;
    }
    case 'status': {
      console.log(await client.workflow.getHandle(arg).query(statusQuery));
      break;
    }
    default:
      console.log('Usage: node src/client.js <start [amount] | approve <id> | reject <id> | status <id>>');
  }
  await connection.close();
}

main().catch((err) => {
  console.error(err.cause?.message ? `${err.message}: ${err.cause.message}` : err);
  process.exit(1);
});
