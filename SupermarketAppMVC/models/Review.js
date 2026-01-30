const db = require('../db');

const Review = {
    add(userId, content, callback) {
        const sql = 'INSERT INTO reviews (user_id, content) VALUES (?, ?)';
        db.query(sql, [userId, content], (err, result) => {
            if (err && err.code === 'ER_NO_SUCH_TABLE') {
                // reviews table missing
                const missing = Object.assign(new Error('Reviews table missing'), { code: 'REVIEWS_TABLE_MISSING' });
                return callback(missing);
            }
            callback(err, result);
        });
    },

    getAll(callback) {
        const sql = `
          SELECT r.id, r.content, r.created_at, u.username
          FROM reviews r
          LEFT JOIN users u ON u.id = r.user_id
          ORDER BY r.created_at DESC, r.id DESC
        `;
        db.query(sql, (err, results) => {
            if (err && err.code === 'ER_NO_SUCH_TABLE') {
                const missing = Object.assign(new Error('Reviews table missing'), { code: 'REVIEWS_TABLE_MISSING' });
                return callback(missing);
            }
            callback(err, results || []);
        });
    }
};

module.exports = Review;
