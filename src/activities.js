// Activities are ordinary async functions that do the real-world, side-effecting
// work (HTTP calls, DB writes, payments...). They run on the worker, outside the
// deterministic workflow sandbox, and Temporal retries them automatically on failure.
const { Context, ApplicationFailure } = require('@temporalio/activity');

function log(msg) {
  const { attempt, activityType } = Context.current().info;
  console.log(`  [activity ${activityType} #${attempt}] ${msg}`);
}

async function reserveInventory(order) {
  log(`reserving ${order.items.join(', ')}`);
  return `rsv-${order.orderId}`;
}

async function releaseInventory(reservationId) {
  log(`releasing reservation ${reservationId}`);
}

// Simulates a flaky payment gateway: the first two attempts fail with a
// transient error, the third succeeds. Watch the retries in the worker logs
// and in the Web UI's event history — the workflow code never sees them.
async function chargePayment(order) {
  const { attempt } = Context.current().info;
  if (attempt < 3) {
    log('payment gateway timed out (simulated)');
    throw new Error('Payment gateway timeout');
  }
  if (order.amount > 10_000) {
    // Non-retryable: retrying will never fix a business-rule violation.
    throw ApplicationFailure.nonRetryable('Card declined: amount over limit', 'CardDeclined');
  }
  log(`charged $${order.amount}`);
  return `pay-${order.orderId}`;
}

async function refundPayment(paymentId) {
  log(`refunding ${paymentId}`);
}

async function shipOrder(order) {
  log(`shipped order ${order.orderId}`);
  return `TRACK-${Math.floor(Math.random() * 1e6)}`;
}

module.exports = { reserveInventory, releaseInventory, chargePayment, refundPayment, shipOrder };
