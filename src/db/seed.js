const { query, closePool } = require('./pool');

async function seed() {
  console.log('[Seed] Seeding sample data into PostgreSQL...');
  try {
    // 1. Seed sample users
    const userRes = await query(`
      INSERT INTO users (username, email, password_hash)
      VALUES 
        ('alice', 'alice@example.com', '$2b$10$dummyHashAlice123456789012345678901234567890123456789'),
        ('bob', 'bob@example.com', '$2b$10$dummyHashBob123456789012345678901234567890123456789')
      ON CONFLICT (email) DO NOTHING
      RETURNING id, username, email;
    `);

    console.log(`[Seed] Seeded ${userRes.rowCount} users.`);

    // 2. Fetch or create general room
    const aliceRes = await query(`SELECT id FROM users WHERE username = 'alice' LIMIT 1;`);
    if (aliceRes.rows.length > 0) {
      const aliceId = aliceRes.rows[0].id;
      const roomRes = await query(
        `
        INSERT INTO rooms (name, is_private, owner_id)
        VALUES ('General Discussion', false, $1)
        RETURNING id, name;
      `,
        [aliceId]
      );

      if (roomRes.rows.length > 0) {
        const roomId = roomRes.rows[0].id;
        await query(
          `
          INSERT INTO room_members (room_id, user_id, role)
          VALUES ($1, $2, 'owner')
          ON CONFLICT DO NOTHING;
        `,
          [roomId, aliceId]
        );

        // Seed initial message
        await query(
          `
          INSERT INTO messages (room_id, sender_id, content, delivered)
          VALUES ($1, $2, 'Welcome to the General Discussion room!', true);
        `,
          [roomId, aliceId]
        );
        console.log(`[Seed] Seeded room "${roomRes.rows[0].name}" and welcome message.`);
      }
    }

    console.log('[Seed] Database seeding completed successfully.');
  } catch (err) {
    console.error('[Seed Error] Failed to seed database:', err.message);
  } finally {
    await closePool();
  }
}

if (require.main === module) {
  seed();
}

module.exports = { seed };
