const db = require('../db');

const User = {
    getAll(callback) {
        const sql = 'SELECT id, username, email, address, contact, role FROM users ORDER BY id ASC';
        db.query(sql, (err, results) => callback(err, results));
    },

    getById(id, callback) {
        const sql = 'SELECT id, username, email, address, contact, role FROM users WHERE id = ?';
        db.query(sql, [id], (err, results) => callback(err, results && results[0] ? results[0] : null));
    },

    create(user, callback) {
        const sql = 'INSERT INTO users (username, email, password, address, contact, role) VALUES (?, ?, SHA1(?), ?, ?, ?)';
        const params = [user.username, user.email, user.password, user.address, user.contact, user.role];
        db.query(sql, params, (err, result) => callback(err, result));
    },

    findByCredentials(email, password, callback) {
        const sql = 'SELECT * FROM users WHERE email = ? AND password = SHA1(?)';
        db.query(sql, [email, password], (err, results) => callback(err, results && results[0] ? results[0] : null));
    },

    update(id, user, callback) {
        const sql = 'UPDATE users SET username = ?, email = ?, address = ?, contact = ?, role = ? WHERE id = ?';
        const params = [user.username, user.email, user.address, user.contact, user.role, id];
        db.query(sql, params, (err, result) => callback(err, result));
    },

    delete(id, callback) {
        const sql = 'DELETE FROM users WHERE id = ?';
        db.query(sql, [id], (err, result) => callback(err, result));
    }
};

module.exports = User;
