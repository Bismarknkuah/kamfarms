import { TtlCache } from '../ttl-cache';

describe('TtlCache', () => {
  it('keeps a value for its time and then loads again', async () => {
    let t = 0; const c = new TtlCache<number>(1000, 10, () => t); const load = jest.fn(async () => 7);
    expect(await c.get('k', load)).toBe(7); t = 999; expect(await c.get('k', load)).toBe(7); expect(load).toHaveBeenCalledTimes(1);
    t = 1000; await c.get('k', load); expect(load).toHaveBeenCalledTimes(2);
  });
  it('lets everyone asking at once share ONE load', async () => {
    const c = new TtlCache<string>(1000); let release!: (v: string) => void;
    const load = jest.fn(() => new Promise<string>((r) => { release = r; }));
    const all = Promise.all([c.get('k', load), c.get('k', load), c.get('k', load)]); release('done');
    expect(await all).toEqual(['done', 'done', 'done']); expect(load).toHaveBeenCalledTimes(1);
  });
  it('never keeps a failed load, so the next ask tries again', async () => {
    const c = new TtlCache<string>(1000); const load = jest.fn().mockRejectedValueOnce(new Error('db down')).mockResolvedValueOnce('ok');
    await expect(c.get('k', load)).rejects.toThrow('db down'); expect(await c.get('k', load)).toBe('ok');
  });
  it('keeps people apart by key, and holds at most `max` entries', async () => {
    const c = new TtlCache<string>(1000, 2); c.set('a', 'A'); c.set('b', 'B'); c.set('c', 'C');
    expect(c.peek('a')).toBeUndefined(); expect(c.peek('b')).toBe('B'); expect(c.peek('c')).toBe('C');
  });
  it('gives up on a load that never finishes, so one stuck query cannot block a person for ever', async () => {
    let t = 0; const c = new TtlCache<string>(1000, 10, () => t);
    void c.get('k', () => new Promise<string>(() => {}));                    // never answers
    t = 500; const waiting = jest.fn(async () => 'new'); void c.get('k', waiting); expect(waiting).not.toHaveBeenCalled();   // still within its time: shares the stuck load
    t = 1000; expect(await c.get('k', async () => 'fresh')).toBe('fresh');   // beyond it: a fresh load starts
  });
});
