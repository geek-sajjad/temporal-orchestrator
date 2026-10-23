# Temporal Orchestrator Demo (JavaScript)

A small order-processing workflow that shows Temporal's core ideas with the
[TypeScript/JavaScript SDK](https://docs.temporal.io/develop/typescript).

```
reserveInventory ─► chargePayment ─► [amount > $100?] wait for approve/reject signal ─► sleep 5s ─► shipOrder
     (flaky: fails twice, auto-retried)        (durable, up to 2 min)                   (durable timer)
           └──────── on any failure: refundPayment, releaseInventory (saga compensation) ────────┘
```

| Concept | Where |
|---|---|
| **Workflow** – deterministic orchestration code, replayed from history | [src/workflows.js](src/workflows.js) |
| **Activity** – side-effecting work, retried automatically | [src/activities.js](src/activities.js) |
| **Worker** – your process that runs both | [src/worker.js](src/worker.js) |
| **Client** – starts workflows, sends signals, runs queries | [src/client.js](src/client.js) |

## Run it

```bash
npm install
npm run server          # Temporal dev server in Docker (gRPC :7233, UI http://localhost:8233)
npm run worker          # terminal 1
npm start               # terminal 2 – starts a $250 order and waits for the result
```

The client prints the workflow ID and a UI link. In a third terminal:

```bash
npm run status  -- order-XXXX   # query live state → { status: 'AWAITING_APPROVAL' }
npm run approve -- order-XXXX   # signal → order completes after a 5s timer
npm run reject  -- order-XXXX   # or: signal → payment refunded, inventory released
```

`npm start -- 50` starts a small order that skips approval.

## Things to try

1. **Retries** – watch the worker log: `chargePayment` fails on attempts 1 and 2, succeeds on 3.
   The workflow code never sees those failures. Open the workflow in the UI and look at the
   pending activity's attempt count.
2. **Durability** – start an order, then **kill the worker (Ctrl+C)** while it's
   `AWAITING_APPROVAL`. Send `approve` anyway (the signal is stored by the server). Restart the
   worker: it replays history, picks up exactly where it left off, and finishes the order.
3. **Timeouts** – start an order and do nothing. After 2 minutes the `condition` times out and
   the saga compensations run.
4. **Non-retryable errors** – `npm start -- 20000` hits the card-limit rule, which throws
   `ApplicationFailure.nonRetryable` so Temporal doesn't keep retrying.
5. **Event history** – in the UI, each workflow's history shows every activity scheduled,
   timer fired, and signal received. That history *is* the workflow's state.

`npm run server:stop` shuts the server down (state is in-memory and is lost).
