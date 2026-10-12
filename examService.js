const pool = require('../db');
const cache = require('../cache');
const config = require('../config');

const examKey = (id) => `exam:${id}`;

async function listExams() {
  const { rows } = await pool.query(
    'SELECT id, title, description, duration_minutes, is_published, created_at FROM exams ORDER BY created_at DESC'
  );
  return rows;
}

async function createExam(input) {
  const { rows } = await pool.query(
    `INSERT INTO exams (title, description, duration_minutes, is_published)
     VALUES ($1, $2, $3, $4)
     RETURNING id, title, description, duration_minutes, is_published, created_at`,
    [input.title, input.description || '', input.duration_minutes, Boolean(input.is_published)]
  );
  return rows[0];
}

async function getExam(id) {
  const key = examKey(id);
  const cached = await cache.get(key);
  if (cached) return { ...cached, cache: 'HIT' };

  const examResult = await pool.query(
    `SELECT id, title, description, duration_minutes, is_published, created_at
     FROM exams WHERE id = $1`, [id]
  );
  if (!examResult.rowCount) return null;

  const questionsResult = await pool.query(
    `SELECT id, exam_id, prompt, options, points, position
     FROM questions WHERE exam_id = $1 ORDER BY position, created_at`, [id]
  );
  const result = { ...examResult.rows[0], questions: questionsResult.rows };
  await cache.set(key, result, config.cacheTtlSeconds);
  return { ...result, cache: 'MISS' };
}

async function addQuestion(examId, input) {
  const { rows } = await pool.query(
    `INSERT INTO questions (exam_id, prompt, options, correct_answer, points, position)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6)
     RETURNING id, exam_id, prompt, options, points, position`,
    [examId, input.prompt, JSON.stringify(input.options || []), input.correct_answer, input.points || 1, input.position || 0]
  );
  await cache.del(examKey(examId));
  return rows[0];
}

module.exports = { listExams, createExam, getExam, addQuestion, examKey };
