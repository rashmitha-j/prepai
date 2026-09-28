jest.mock('../src/services/aiClient');

const db = require('./helpers/db');
const { app, request, registerUser } = require('./helpers/api');
const aiClient = require('../src/services/aiClient');
const AppError = require('../src/utils/AppError');
const User = require('../src/models/User');
const KnowledgeDocument = require('../src/models/KnowledgeDocument');
const knowledgeService = require('../src/services/knowledgeService');

beforeAll(db.connect);
afterAll(db.disconnect);
beforeEach(async () => {
  jest.resetAllMocks();
  await KnowledgeDocument.deleteMany({});
});

const DOC = {
  docId: 'kb-test-os',
  title: 'Operating Systems',
  topic: 'os',
  source: 'os.md',
  content: '# OS\n\n## Deadlocks\n\nMutual exclusion, hold and wait, no preemption and circular wait are required.',
};

async function admin() {
  const u = await registerUser();
  await User.updateOne({ _id: u.user._id }, { role: 'admin' });
  return u;
}

describe('knowledge base', () => {
  it('lists documents without content and returns content on detail', async () => {
    await knowledgeService.upsertDocument(DOC);
    const { auth } = await registerUser();
    const list = await request(app).get('/api/knowledge').set(auth);
    expect(list.status).toBe(200);
    expect(list.body.documents[0]).toMatchObject({ docId: 'kb-test-os', topic: 'os', ingestionStatus: 'pending' });
    expect(list.body.documents[0].content).toBeUndefined();
    const detail = await request(app).get('/api/knowledge/kb-test-os').set(auth);
    expect(detail.body.document.content).toContain('circular wait');
  });

  it('searches through the RAG retriever and returns source metadata', async () => {
    aiClient.retrieve.mockResolvedValue({
      query: 'deadlock',
      embedding: 'hash:512',
      chunks: [{ id: 'kb-test-os::0', docId: 'kb-test-os', title: 'Operating Systems', topic: 'os', section: 'OS > Deadlocks', source: 'os.md', score: 0.71, chunkIndex: 0, text: 'Mutual exclusion...' }],
    });
    const { auth } = await registerUser();
    const res = await request(app).post('/api/knowledge/search').set(auth).send({ query: 'deadlock', topic: 'os', topK: 3 });
    expect(res.status).toBe(200);
    expect(res.body.results[0]).toMatchObject({ docId: 'kb-test-os', section: 'OS > Deadlocks', score: 0.71 });
    expect(aiClient.retrieve).toHaveBeenCalledWith({ query: 'deadlock', topK: 3, topic: 'os' });
    expect((await request(app).post('/api/knowledge/search').set(auth).send({ query: 'x' })).status).toBe(422);
  });

  it('restricts document management to admins (403 for users)', async () => {
    const { auth } = await registerUser();
    expect((await request(app).post('/api/knowledge').set(auth).send(DOC)).status).toBe(403);
    expect((await request(app).post('/api/knowledge/reindex').set(auth)).status).toBe(403);
    expect((await request(app).delete('/api/knowledge/kb-test-os').set(auth)).status).toBe(403);
    expect(aiClient.ingest).not.toHaveBeenCalled();
  });

  it('lets admins create documents, which are ingested into the vector store', async () => {
    aiClient.ingest.mockResolvedValue({ documents: [{ id: 'kb-test-os', chunks: 1 }], totalChunks: 1, embedding: 'hash:512' });
    const { auth } = await admin();
    const res = await request(app).post('/api/knowledge').set(auth).send(DOC);
    expect(res.status).toBe(201);
    expect(res.body.document).toMatchObject({ ingestionStatus: 'ingested', chunkCount: 1, embedding: 'hash:512' });
    expect(aiClient.ingest.mock.calls[0][0][0]).toMatchObject({ id: 'kb-test-os', topic: 'os' });
  });

  it('marks documents failed when the AI service is down', async () => {
    aiClient.ingest.mockRejectedValue(new AppError(503, 'AI_SERVICE_UNAVAILABLE', 'down'));
    const { auth } = await admin();
    const res = await request(app).post('/api/knowledge').set(auth).send(DOC);
    expect(res.status).toBe(503);
    expect((await KnowledgeDocument.findOne({ docId: 'kb-test-os' })).ingestionStatus).toBe('failed');
  });

  it('startup sync re-ingests only documents missing from the index', async () => {
    await knowledgeService.upsertDocument(DOC);
    await knowledgeService.upsertDocument({ ...DOC, docId: 'kb-test-react', title: 'React', topic: 'react' });
    await KnowledgeDocument.updateOne({ docId: 'kb-test-react' }, { ingestionStatus: 'ingested', embedding: 'hash:512' });
    aiClient.ragStats.mockResolvedValue({ embedding: 'hash:512', perDocument: { 'kb-test-react': 3 } });
    aiClient.ingest.mockResolvedValue({ documents: [{ id: 'kb-test-os', chunks: 2 }], totalChunks: 2, embedding: 'hash:512' });
    const result = await knowledgeService.syncKnowledgeBase();
    expect(result).toEqual({ synced: 1, chunks: 2 });
    expect(aiClient.ingest.mock.calls[0][0].map((d) => d.id)).toEqual(['kb-test-os']);

    // Embedding model changed -> everything is re-indexed into the new collection.
    aiClient.ingest.mockReset();
    aiClient.ragStats.mockResolvedValue({ embedding: 'ollama:nomic-embed-text', perDocument: {} });
    aiClient.ingest.mockResolvedValue({ documents: [], totalChunks: 5, embedding: 'ollama:nomic-embed-text' });
    expect((await knowledgeService.syncKnowledgeBase()).synced).toBe(2);
  });
});
