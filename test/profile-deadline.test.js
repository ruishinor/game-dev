import test from 'node:test';
import assert from 'node:assert/strict';
import { withDeadline } from '../tools/profile-deadline.mjs';

test('successful operations return their value and log completion', async () => {
  const logs = [];
  const v = await withDeadline('fast', () => 7, 1000, (line) => logs.push(line));
  assert.equal(v, 7);
  assert.match(logs.join('\n'), /start[\s\S]*complete/);
});
test('browser operation stalled indefinitely triggers host deadline', async () => {
  const logs = [];
  await assert.rejects(
    withDeadline('hung evaluate', () => new Promise(() => {}), 25, (line) => logs.push(line)),
    /Profile deadline exceeded: hung evaluate/,
  );
  assert.match(logs.at(-1), /failed/);
});
test('original errors propagate', async () => {
  await assert.rejects(
    withDeadline('reject', () => Promise.reject(new Error('original error')), 1000, () => {}),
    /original error/,
  );
});
test('invalid deadlines are rejected', async () => {
  await assert.rejects(withDeadline('invalid', () => 0, 0, () => {}), RangeError);
  await assert.rejects(withDeadline('invalid', () => 0, NaN, () => {}), RangeError);
});
