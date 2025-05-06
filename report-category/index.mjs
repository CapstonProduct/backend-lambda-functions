import mysql from 'mysql2/promise';

export const handler = async (event) => {
  let connection;

  try {
    const { encodedId, report_date } = parseRequestBody(event.body);

    connection = await createDbConnection();

    const userId = await getUserId(connection, encodedId);
    const report = await getHealthReport(connection, userId, report_date);

    return buildResponse(200, report || {});
  } catch (error) {
    console.error('Lambda error:', error);
    return buildResponse(500, { error: 'Internal Server Error', detail: error.message });
  } finally {
    if (connection) await connection.end();
  }
};

function parseRequestBody(body) {
  if (!body) throw new Error('Request body is missing');
  const parsed = JSON.parse(body);

  if (!parsed.encodedId || !parsed.report_date) {
    throw new Error('Missing required fields: encodedId or report_date');
  }

  return parsed;
}

async function createDbConnection() {
  return await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    charset: 'utf8mb4',
  });
}

async function getUserId(connection, encodedId) {
  const [rows] = await connection.execute(
    'SELECT id FROM users WHERE encodedId = ?',
    [encodedId]
  );

  if (rows.length === 0) {
    throw new Error('User not found');
  }

  return rows[0].id;
}

async function getHealthReport(connection, userId, reportDate) {
  const [reports] = await connection.execute(
    'SELECT * FROM daily_health_reports WHERE user_id = ? AND report_date = ?',
    [userId, reportDate]
  );

  return reports[0];
}

function buildResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(body),
  };
}
