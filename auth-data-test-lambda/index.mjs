import mysql from 'mysql2/promise';

export async function handler(event) {
  try {
    console.log("[전체 event 로그]:");
    console.log(JSON.stringify(event, null, 2));

    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "요청 body가 없습니다." }),
      };
    }

    let data;
    try {
      data = JSON.parse(event.body);
    } catch (e) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "잘못된 JSON 형식입니다.", detail: e.message }),
      };
    }

    console.log("[받은 데이터]:");
    console.log(JSON.stringify(data, null, 2));

    const { fitbit_user_id, access_token, refresh_token } = data;

    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    });

    const [result] = await connection.execute(`
      UPDATE users
      SET 
        access_token = ?, 
        refresh_token = ?, 
        updated_at = NOW()
      WHERE encodedId = ?
    `, [access_token, refresh_token, fitbit_user_id]);

    await connection.end();

    if (result.affectedRows === 0) {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: "해당 Fitbit 사용자를 찾을 수 없습니다.", fitbit_user_id }),
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ message: "토큰 저장 완료", received: data }),
    };
  } catch (error) {
    console.error("[에러 발생]:", error);

    return {
      statusCode: 500,
      body: JSON.stringify({ error: "서버 오류 발생", message: error.message }),
    };
  }
}