import mysql from 'mysql2/promise';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const FALLBACK_MESSAGE = "네트워크 연결을 확인하세요.";
const DEFAULT_RESULTS = {
  exercise_month_analysis: FALLBACK_MESSAGE,
  exercise_yesterday_analysis: FALLBACK_MESSAGE,
  exercise_recommendation: FALLBACK_MESSAGE,
};

export const handler = async (event) => {
  let connection;

  try {
    const { encodedId, date } = JSON.parse(event.body);
    connection = await connectToDatabase();

    const userId = await getUserId(connection, encodedId);
    if (!userId) {
      return buildResponse(404, { ...DEFAULT_RESULTS, message: 'User not found' });
    }

    const monthData = await getMonthData(connection, userId, date);
    const yesterdayData = await getYesterdayData(connection, userId, getYesterdayDateString(date));

    const results = await getGptResults(monthData, yesterdayData);

    return buildResponse(200, results);
  } catch (error) {
    return buildResponse(500, {
      ...DEFAULT_RESULTS,
      message: 'Internal server error',
      error: error.message,
    });
  } finally {
    if (connection) await connection.end();
  }
};

async function connectToDatabase() {
  return mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    charset: 'utf8mb4',
  });
}

async function getUserId(conn, encodedId) {
  const [users] = await conn.execute(
    'SELECT id FROM users WHERE encodedId = ?',
    [encodedId]
  );
  return users[0]?.id || null;
}

async function getMonthData(conn, userId, date) {
  const [rows] = await conn.execute(
    `SELECT * FROM fitbit_average_history 
     WHERE user_id = ? AND recorded_at = ? AND period_type = '30D'`,
    [userId, date]
  );
  return rows[0] || {};
}

async function getYesterdayData(conn, userId, date) {
  const [rows] = await conn.execute(
    `SELECT * FROM fitbit_activity_summary 
     WHERE user_id = ? AND date = ?`,
    [userId, date]
  );
  return rows[0] || {};
}

function getYesterdayDateString(dateStr) {
  const date = new Date(dateStr);
  date.setDate(date.getDate() - 1);
  return date.toISOString().split('T')[0];
}

async function getGptResults(monthData, yesterdayData) {
  const prompts = [
    {
      key: 'exercise_month_analysis',
      prompt: `
당신은 노인 헬스케어 전문가입니다.
[한 달 평균 운동 데이터] ${JSON.stringify(monthData)}
이 데이터를 기반으로 사용자의 한 달간 운동 습관과 건강 상태를 분석해주세요 (200자 이내).
      `.trim()
    },
    {
      key: 'exercise_yesterday_analysis',
      prompt: `
당신은 노인 헬스케어 전문가입니다.
[어제 운동 데이터] ${JSON.stringify(yesterdayData)}
이 데이터를 기반으로 어제 하루의 운동 분석해주세요 (200자 이내).
      `.trim()
    },
    {
      key: 'exercise_recommendation',
      prompt: `
당신은 노인 헬스케어 전문가입니다.
[한 달 평균 운동 데이터] ${JSON.stringify(monthData)}
[어제 운동 데이터] ${JSON.stringify(yesterdayData)}
이 정보를 기반으로 다음을 알려주세요:
1. 추천 운동 2~3가지 (이유 포함)
2. 운동 시 주의사항
3. 전반적인 피드백
모든 응답은 200자 이내 요약문으로 제공해주세요.
      `.trim()
    },
  ];

  const results = { ...DEFAULT_RESULTS };

  const responses = await Promise.all(prompts.map(({ key, prompt }) =>
    openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
    }).then(res => ({ key, text: res.choices[0].message.content.trim() }))
      .catch(() => ({ key, text: 'AI 응답을 가져오지 못했습니다.' }))
  ));

  responses.forEach(({ key, text }) => {
    results[key] = text;
  });

  return results;
}

function buildResponse(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  };
}
