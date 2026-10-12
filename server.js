const express = require('express');
const config = require('./config');
const pool = require('./db');
const cache = require('./cache');
const exams = require('./services/examService');
const candidates = require('./services/candidateService');

const app = express();
app.use(express.json({ limit: '1mb' }));

function requiredString(value, field, max = 5000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    const error = new Error(`${field} is required and must be at most ${max} characters.`);
    error.status = 400;
    throw error;
  }
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

app.get('/health', asyncRoute(async (_req, res) => {
  let database = 'ok';
  try { await pool.query('SELECT 1'); } catch { database = 'error'; }
  res.status(database === 'ok' ? 200 : 503).json({ status: database === 'ok' ? 'ok' : 'degraded', database });
}));

app.get('/api/exams', asyncRoute(async (_req, res) => res.json(await exams.listExams())));

app.post('/api/exams', asyncRoute(async (req, res) => {
  requiredString(req.body.title, 'title', 200);
  const duration = Number(req.body.duration_minutes);
  if (!Number.isInteger(duration) || duration <= 0) return res.status(400).json({ error: 'duration_minutes must be a positive integer.' });
  res.status(201).json(await exams.createExam({ ...req.body, duration_minutes: duration }));
}));

app.get('/api/exams/:id', asyncRoute(async (req, res) => {
  const result = await exams.getExam(req.params.id);
  if (!result) return res.status(404).json({ error: 'Exam not found.' });
  res.set('X-Cache', result.cache);
  const { cache: _cacheStatus, ...body } = result;
  res.json(body);
}));

app.post('/api/exams/:id/questions', asyncRoute(async (req, res) => {
  requiredString(req.body.prompt, 'prompt');
  requiredString(req.body.correct_answer, 'correct_answer', 1000);
  if (!Array.isArray(req.body.options)) return res.status(400).json({ error: 'options must be an array.' });
  res.status(201).json(await exams.addQuestion(req.params.id, req.body));
}));

app.post('/api/candidates', asyncRoute(async (req, res) => {
  requiredString(req.body.name, 'name', 120);
  requiredString(req.body.email, 'email', 255);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(req.body.email)) return res.status(400).json({ error: 'email is invalid.' });
  res.status(201).json(await candidates.createCandidate(req.body));
}));

app.put('/api/exams/:examId/answers/:questionId', asyncRoute(async (req, res) => {
  requiredString(req.body.candidate_id, 'candidate_id', 64);
  requiredString(req.body.answer, 'answer', 5000);
  const answer = await candidates.saveAnswer({
    candidateId: req.body.candidate_id,
    examId: req.params.examId,
    questionId: req.params.questionId,
    answer: req.body.answer
  });
  res.json(answer);
}));

app.post('/api/exams/:examId/submit', asyncRoute(async (req, res) => {
  requiredString(req.body.candidate_id, 'candidate_id', 64);
  res.status(201).json(await candidates.submitExam({
    candidateId: req.body.candidate_id,
    examId: req.params.examId
  }));
}));

app.get('/api/candidates/:candidateId/results', asyncRoute(async (req, res) => {
  res.json(await candidates.getResults(req.params.candidateId));
}));

app.use((err, _req, res, _next) => {
  if (err.code === '23505') return res.status(409).json({ error: 'A record with the same unique value already exists.' });
  if (err.code === '23503') return res.status(400).json({ error: 'A referenced record does not exist.' });
  if (err.status) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Internal server error.' });
});

if (require.main === module) {
  const server = app.listen(config.port, () => console.log(`Exam API listening on port ${config.port}`));
  const shutdown = async () => {
    server.close();
    await Promise.allSettled([pool.end(), cache.close()]);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = app;
