// Workflow code is the orchestration logic. It must be deterministic: Temporal
// rebuilds workflow state after a crash by *replaying* the recorded event
// history through this function. So no direct I/O, no Math.random/Date.now
// side effects here — anything non-deterministic belongs in an activity.
// (The SDK sandbox makes Date/Math.random replay-safe for you.)
const wf = require('@temporalio/workflow');

const acts = wf.proxyActivities({
  startToCloseTimeout: '10 seconds',
  retry: {
    initialInterval: '1 second',
    backoffCoefficient: 2,
    maximumAttempts: 5,
  },
});

// Signals push data into a running workflow; queries read its state.
const approveSignal = wf.defineSignal('approve');
const rejectSignal = wf.defineSignal('reject');
const statusQuery = wf.defineQuery('status');

const APPROVAL_THRESHOLD = 100;

async function orderWorkflow(order) {
  let status = 'STARTED';
  let decision; // 'approved' | 'rejected' | undefined
  const compensations = []; // saga: undo steps in reverse on failure

  wf.setHandler(statusQuery, () => ({ status, decision }));
  wf.setHandler(approveSignal, () => void (decision = 'approved'));
  wf.setHandler(rejectSignal, () => void (decision = 'rejected'));

  try {
    status = 'RESERVING_INVENTORY';
    const reservationId = await acts.reserveInventory(order);
    compensations.unshift(() => acts.releaseInventory(reservationId));

    status = 'CHARGING_PAYMENT';
    const paymentId = await acts.chargePayment(order);
    compensations.unshift(() => acts.refundPayment(paymentId));

    if (order.amount > APPROVAL_THRESHOLD) {
      status = 'AWAITING_APPROVAL';
      // Durable wait: blocks until a signal arrives or 2 minutes pass. The
      // worker can be killed and restarted during this wait — nothing is lost.
      const gotDecision = await wf.condition(() => decision !== undefined, '2 minutes');
      if (!gotDecision) throw wf.ApplicationFailure.nonRetryable('Approval timed out');
      if (decision === 'rejected') throw wf.ApplicationFailure.nonRetryable('Order rejected by manager');
    }

    status = 'PREPARING_SHIPMENT';
    // Durable timer: lives on the Temporal server, not in worker memory.
    await wf.sleep('5 seconds');

    const trackingNumber = await acts.shipOrder(order);
    status = 'COMPLETED';
    return { orderId: order.orderId, status, trackingNumber };
  } catch (err) {
    status = 'COMPENSATING';
    for (const undo of compensations) await undo();
    status = 'FAILED';
    throw err;
  }
}

module.exports = { orderWorkflow, approveSignal, rejectSignal, statusQuery };
