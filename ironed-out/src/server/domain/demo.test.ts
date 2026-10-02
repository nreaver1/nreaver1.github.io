import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { ensureDemoOuting } from './demo';
import { resolveInviteToken } from './invites';
import { getOutingView } from './outings';

let t: TestDb;
const deps = () => ({ db: t.db, tenantId: t.tenantId, secret: 'demo-test-secret-0123456789-0123456789' });

beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.pg.close();
});

describe('demo outing', () => {
  it('creates a partly filled sample outing once and reuses it', async () => {
    const token = await ensureDemoOuting(deps());
    const id = await resolveInviteToken(deps(), token);
    const view = (await getOutingView(deps(), id!, null))!;
    expect(view.course.name).toBe('Mount Pleasant Golf Course');
    expect(view.totalCount - view.openCount).toBe(8);
    expect(view.teeTimes[0]!.slots.map((s) => s.name)).toEqual([
      'Mike G.',
      'Marcus R.',
      'Jen P.',
      'Jen P.’s guest'.replace('’', "'"),
    ]);
    expect(await ensureDemoOuting(deps())).toBe(token);
  });
});
