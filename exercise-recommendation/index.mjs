import mysql from 'mysql2/promise';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

let connection;

const createConnection = async () => {
  if (!connection) {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      charset: 'utf8mb4',
    });
  }
  return connection;
};

export const handler = async (event) => {
  const fallbackMessage = "네트워크 연결을 확인하세요.";
  const results = {
    exercise_month_analysis: fallbackMessage,
    exercise_yesterday_analysis: fallbackMessage,
    exercise_recommendation: fallbackMessage,
  };

  try {
    const { encodedId, date } = JSON.parse(event.body);
    const conn = await createConnection();

    const [users] = await conn.execute(
      'SELECT id FROM users WHERE encodedId = ?',
      [encodedId]
    );
    if (users.length === 0) {
      return buildResponse(404, { ...results, message: 'User not found' });
    }

    const userId = users[0].id;
    const [reports] = await conn.execute(
      `SELECT overall_health_score, stress_score, total_exercise_time,
              total_sleep_time, avg_exercise_time, avg_heart_rate,
              calories_burned, sleep_score, spo2_variation, sleep_heart_rate
       FROM daily_health_reports
       WHERE user_id = ? AND report_date = ?`,
      [userId, date]
    );
    if (reports.length === 0) {
      return buildResponse(404, { ...results, message: 'Report not found' });
    }

    const healthData = reports[0];
    const dataString = Object.entries(healthData)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');

    const prompts = [
      { key: 'exercise_month_analysis', prompt: `한 달간 운동 경향을 약 200자 분량으로 요약해줘: ${dataString}` },
      { key: 'exercise_yesterday_analysis', prompt: `어제 운동 분석을 약 200자 분량으로 작성해줘: ${dataString}` },
      { key: 'exercise_recommendation', prompt: `추천 운동 및 주의사항을 약 200자 분량으로 알려줘: ${dataString}` },
    ];

    const responses = await Promise.all(prompts.map(({ key, prompt }) =>
      openai.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: prompt }],
      }).then(res => ({ key, text: res.choices[0].message.content.trim() }))
        .catch(() => ({ key, text: 'AI 응답을 가져오지 못했습니다.' }))
    ));

    responses.forEach(({ key, text }) => results[key] = text);

    return buildResponse(200, results);
  } catch (error) {
    return buildResponse(500, { ...results, message: 'Internal server error', error: error.message });
  } finally {
    if (connection) {
      await connection.end();
      connection = null;
    }
  }
};

const buildResponse = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify(body),
});
