import { test } from 'vitest';
import assert from 'node:assert/strict';
import { date, dayOf, isoDay, parseDay, shortDate } from '../src/lib/format.js';

test('Dates display day first, DD/MM/YYYY, with a 24-hour time', () => {
  assert.equal(shortDate('2026-11-03'), '03/11/2026');
  assert.equal(shortDate('2026-11-03T10:00:00Z'), '03/11/2026');
  assert.equal(shortDate(''), '');
  assert.equal(shortDate(undefined), '');
  const local = new Date(2026, 10, 3, 9, 5);
  assert.equal(dayOf(local), '03/11/2026');
  assert.equal(date(local.toISOString()), '03/11/2026, 09:05');
  assert.equal(date(''), '—');
  assert.equal(isoDay(local), '2026-11-03');
});

test('Typed dates are read day first and must be real dates', () => {
  assert.equal(parseDay('3/11/2026'), '2026-11-03');
  assert.equal(parseDay(' 29/02/2028 '), '2028-02-29');
  for (const bad of ['29/02/2027', '31/04/2026', '00/01/2026', '1/13/2026', '2026-11-03', '1/1/26', ''])
    assert.equal(parseDay(bad), null, bad);
});
