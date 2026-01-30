const db = require('../db');

const Cart = {
    getItemsByUserId(userId, callback) {
        const sql = `
          SELECT p.id AS id, p.productName, p.price, p.image, ci.quantity
          FROM cart_items ci
          JOIN products p ON p.id = ci.product_id
          WHERE ci.user_id = ?
        `;
        db.query(sql, [userId], (err, results) => callback(err, results || []));
    },

    getItem(userId, productId, callback) {
        const sql = 'SELECT * FROM cart_items WHERE user_id = ? AND product_id = ?';
        db.query(sql, [userId, productId], (err, results) => callback(err, results && results[0] ? results[0] : null));
    },

    addOrIncrement(userId, productId, quantity, callback) {
        const sql = `
          INSERT INTO cart_items (user_id, product_id, quantity)
          VALUES (?, ?, ?)
          ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)
        `;
        db.query(sql, [userId, productId, quantity], (err, result) => callback(err, result));
    },

    removeItem(userId, productId, callback) {
        const sql = 'DELETE FROM cart_items WHERE user_id = ? AND product_id = ?';
        db.query(sql, [userId, productId], (err, result) => callback(err, result));
    },

    clear(userId, callback) {
        const sql = 'DELETE FROM cart_items WHERE user_id = ?';
        db.query(sql, [userId], (err, result) => callback(err, result));
    }
};

module.exports = Cart;
