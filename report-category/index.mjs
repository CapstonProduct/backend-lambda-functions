import mysql from 'mysql2/promise';

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
  console.log("Lambda function triggered", event);

  try {
    const conn = await createConnection();

    const [rows] = await conn.execute(
      'SELECT overall_health_score, stress_score FROM daily_health_reports ORDER BY report_date DESC LIMIT 1'
    );

    if (rows.length === 0) {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: 'No data found' }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        overall_health_score: rows[0].overall_health_score,
        stress_score: rows[0].stress_score,
      }),
    };

  } catch (error) {
    console.error('Error occurred:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: '데이터를 가져오는 중 오류 발생',
        error: error.message,
      }),
    };
  } finally {
    if (connection) {
      await connection.end();
      connection = null; 
    }
  }
};
