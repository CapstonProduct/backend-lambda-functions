import mysql from 'mysql2/promise';

export const handler = async (event) => {
  let connection;

  try {
    const { encodedId, report_date, role } = parseRequestBody(event.body);

    connection = await createDbConnection();
    const userId = await getUserId(connection, encodedId);
    const reportId = await getReportId(connection, userId, report_date);

    const comment = reportId ? await getCommentByRole(connection, reportId, role) : null;
    const label = role === 'doctor' ? '의사 조언이 없습니다.' : '보호자 조언이 없습니다.';

    return buildResponse(200, { content: comment || label });

  } catch (error) {
    console.error('Lambda error:', error);
    return buildResponse(500, { error: 'Internal Server Error', detail: error.message });
  } finally {
    await connection?.end();
  }
};

function parseRequestBody(body) {
  if (!body) throw new Error('Request body is missing');
  const { encodedId, report_date, role } = JSON.parse(body);

  if (!encodedId || !report_date || !role) {
    throw new Error('Missing required fields: encodedId, report_date or role');
  }

  const cleaned = report_date.replace(/\s/g, '').replace(/\//g, '-');
  const parsedDate = new Date(cleaned);
  if (isNaN(parsedDate.getTime())) {
    throw new Error(`Invalid date format: ${report_date}`);
  }

  return {
    encodedId,
    report_date: parsedDate.toISOString().split('T')[0],
    role: role.toLowerCase(),
  };
}

async function createDbConnection() {
  return mysql.createConnection({
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
  if (!rows.length) throw new Error('User not found');
  return rows[0].id;
}

async function getReportId(connection, userId, reportDate) {
  const [rows] = await connection.execute(
    'SELECT report_id FROM health_reports_pdf WHERE user_id = ? AND report_date = ?',
    [userId, reportDate]
  );
  return rows.length ? rows[0].report_id : null;
}

async function getCommentByRole(connection, reportId, role) {
  const [rows] = await connection.execute(
    'SELECT content FROM comments WHERE report_id = ? AND role = ?',
    [reportId, role]
  );
  return rows.length ? rows[0].content : null;
}

function buildResponse(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  };
}
