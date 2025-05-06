// Environment variable of lambda: DB_HOST, DB_USER, DB_PASSWORD, DB_NAME
// Need json file ('firebase-sdk-key.json'): Firebase Admin SDK Key

import { JWT } from 'google-auth-library';
import mysql from 'mysql2/promise';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const serviceAccount = require('./firebase-sdk-key.json');

async function getAccessToken() {
  const jwtClient = new JWT({
    email: serviceAccount.client_email,
    key: serviceAccount.private_key,
    scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
  });

  const accessToken = await jwtClient.authorize();
  return accessToken.access_token;
}

async function sendNotification(token, title, body) {
  const accessToken = await getAccessToken();

  const message = {
    message: {
      token,
      notification: { title, body },
      android: { priority: 'high' },
    },
  };

  const response = await fetch(
    'https://fcm.googleapis.com/v1/projects/dayinbloom-4dde1/messages:send',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    }
  );

  const data = await response.json();
  console.log('Status:', response.status);
  console.log('Response:', data);
}

export const handler = async (event) => {
  let connection;

  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    });

    const userId = event.userId || 1;

    const [rows] = await connection.execute(
      'SELECT fcm_token FROM device_tokens WHERE user_id = ? AND is_active = TRUE',
      [userId]
    );

    if (rows.length === 0) {
      console.log('No active token found for user:', userId);
      return {
        statusCode: 404,
        body: JSON.stringify({ message: 'No active token found' }),
      };
    }

    const fcmToken = rows[0].fcm_token;
    const title = '꽃이 되는 하루';
    const body = '좋은 아침이에요! 푹 주무셨나요?';

    await sendNotification(fcmToken, title, body);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Notification sent successfully' }),
    };
  } catch (error) {
    console.error('Error sending notification:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Failed to send notification' }),
    };
  } finally {
    if (connection) {
      await connection.end();
    }
  }
};
