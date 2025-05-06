import mysql from 'mysql2/promise';

export const handler = async (event) => {
  let connection;

  try {
    const { fcmToken, userId, platform } = JSON.parse(event.body);

    connection = await mysql.createConnection({
      host: process.env.DB_HOST,  // RDS 엔드포인트
      user: process.env.DB_USER,  // MySQL 사용자명
      password: process.env.DB_PASSWORD,  // MySQL 비밀번호
      database: process.env.DB_NAME,  // MySQL 데이터베이스 이름
    });

    const [rows] = await connection.execute(
      'SELECT * FROM device_tokens WHERE user_id = ?',
      [userId]
    );

    let query, values;

    if (rows.length > 0) {
      query = `
        UPDATE device_tokens
        SET fcm_token = ?, platform = ?, is_active = TRUE
        WHERE user_id = ?;
      `;
      values = [fcmToken, platform, userId];
    } else {
      query = `
        INSERT INTO device_tokens (user_id, fcm_token, platform, is_active)
        VALUES (?, ?, ?, TRUE);
      `;
      values = [userId, fcmToken, platform];
    }

    const [results] = await connection.execute(query, values);

    console.log('Token saved or updated successfully:', results);
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Token saved or updated successfully' }),
    };
  } catch (error) {
    console.error('Error saving or updating token:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Failed to save or update token' }),
    };
  } finally {
    if (connection) {
      await connection.end();
    }
  }
};
