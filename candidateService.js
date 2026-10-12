const pool = require('../db');

async function createCandidate(input) {
  const { rows } = await pool.query(
    'INSERT INTO candidates (name, email) VALUES ($1, $2) RETURNING id, name, email, created_at',
    [input.name, input.email]
  );
  return rows[0];
}

async function saveAnswer({ candidateId, examId, questionId, answer }) {
  const { rows } = await pool.query(
    `INSERT INTO exam_answers (candidate_id, exam_id, question_id, answer)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (candidate_id, exam_id, question_id)
     DO UPDATE SET answer = EXCLUDED.answer, updated_at = NOW()
     RETURNING id, candidate_id, exam_id, question_id, answer, updated_at`,
    [candidateId, examId, questionId, answer]
  );
  return rows[0];
}

async function submitExam({ candidateId, examId }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query(
      'SELECT * FROM exam_submissions WHERE candidate_id = $1 AND exam_id = $2',
      [candidateId, examId]
    );
    if (existing.rowCount) {
      await client.query('COMMIT');
      return existing.rows[0];
    }

    const result = await client.query(
      `SELECT COALESCE(SUM(CASE WHEN a.answer = q.correct_answer THEN q.points ELSE 0 END), 0) AS score,
              COALESCE(SUM(q.points), 0) AS total_points
       FROM questions q
       LEFT JOIN exam_answers a
         ON a.question_id = q.id AND a.exam_id = q.exam_id AND a.candidate_id = $2
       WHERE q.exam_id = $1`,
      [examId, candidateId]
    );

    const inserted = await client.query(
      `INSERT INTO exam_submissions (candidate_id, exam_id, score, total_points)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (candidate_id, exam_id) DO NOTHING
       RETURNING *`,
      [candidateId, examId, result.rows[0].score, result.rows[0].total_points]
    );

    const finalRow = inserted.rows[0] || (await client.query(
      'SELECT * FROM exam_submissions WHERE candidate_id = $1 AND exam_id = $2',
      [candidateId, examId]
    )).rows[0];

    await client.query('COMMIT');
    return finalRow;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function getResults(candidateId) {
  const { rows } = await pool.query(
    `SELECT s.id, s.exam_id, e.title AS exam_title, s.score, s.total_points, s.submitted_at
     FROM exam_submissions s JOIN exams e ON e.id = s.exam_id
     WHERE s.candidate_id = $1 ORDER BY s.submitted_at DESC`,
    [candidateId]
  );
  return rows;
}

module.exports = { createCandidate, saveAnswer, submitExam, getResults };
