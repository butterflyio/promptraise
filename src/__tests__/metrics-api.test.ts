import handler from '../pages/api/admin/metrics';

// Basic shape test using a mocked req/res
function createMockRes() {
  const res: any = {};
  res.statusCode = 200;
  res.headers = {};
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.setHeader = (k: string, v: string) => {
    res.headers[k] = v;
  };
  res.json = (body: any) => {
    res.body = body;
    return res;
  };
  return res;
}

describe('admin metrics handler', () => {
  it('rejects unauthorized', async () => {
    const req: any = { method: 'GET', headers: {}, query: {} };
    const res = createMockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(401);
  });
});
