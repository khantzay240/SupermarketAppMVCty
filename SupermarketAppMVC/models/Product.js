
/**
 * Function-based Product model (MVC)
 * Exports an object with methods that use a MySQL connection from ../db.
 * Each method accepts parameters and a callback(err, results).
 * Table fields assumed: id, productName, quantity, price, image
 */

const Product = {
	// Get all products
	getAll(callback) {
		const db = require('../db');
		const sql = 'SELECT * FROM products';
		db.query(sql, (err, results) => callback(err, results));
	},

	// Get a single product by ID
	getById(id, callback) {
		const db = require('../db');
		const sql = 'SELECT * FROM products WHERE id = ?';
		db.query(sql, [id], (err, results) => callback(err, results && results[0] ? results[0] : null));
	},

	// Add a new product. `product` should be an object { productName, quantity, price, image }
	add(product, callback) {
		const db = require('../db');
		const sql = 'INSERT INTO products (productName, quantity, price, image) VALUES (?, ?, ?, ?)';
		const params = [product.productName, product.quantity, product.price, product.image || null];
		db.query(sql, params, (err, result) => callback(err, result));
	},

	// Update an existing product by ID. `product` same shape as add
	update(id, product, callback) {
		const db = require('../db');
		const sql = 'UPDATE products SET productName = ?, quantity = ?, price = ?, image = ? WHERE id = ?';
		const params = [product.productName, product.quantity, product.price, product.image || null, id];
		db.query(sql, params, (err, result) => callback(err, result));
	},

	// Delete a product by ID
	delete(id, callback) {
		const db = require('../db');
		const sql = 'DELETE FROM products WHERE id = ?';
		db.query(sql, [id], (err, result) => callback(err, result));
	},

	// Find by product name (case-insensitive). Returns first match.
	findByName(name, callback) {
		const db = require('../db');
		const sql = 'SELECT * FROM products WHERE LOWER(productName) LIKE LOWER(?) ORDER BY LENGTH(productName) ASC LIMIT 1';
		db.query(sql, [`%${name}%`], (err, results) => callback(err, results && results[0] ? results[0] : null));
	},

	// Get products by category name (case-insensitive)
	getByCategory(category, callback) {
		const db = require('../db');
		const sql = 'SELECT * FROM products WHERE LOWER(category) = LOWER(?)';
		db.query(sql, [category], (err, results) => {
			if (err && err.code === 'ER_BAD_FIELD_ERROR') {
				// Fallback when category column does not exist: load all and filter in-app
				return db.query('SELECT * FROM products', (err2, rows) => {
					if (err2) return callback(err2);
					const filtered = (rows || []).filter(p => {
						const c = (p.category || '').toLowerCase();
						if (!c) return category.toLowerCase() === 'others';
						return c === category.toLowerCase();
					});
					return callback(null, filtered);
				});
			}
			callback(err, results || []);
		});
	},

	updateCategory(productId, category, callback) {
		const db = require('../db');
		const sql = 'UPDATE products SET category = ? WHERE id = ?';
		db.query(sql, [category, productId], (err, result) => {
			if (err && err.code === 'ER_BAD_FIELD_ERROR') {
				// Try to add the category column automatically, then retry once
				const alterSql = 'ALTER TABLE products ADD COLUMN category VARCHAR(100)';
				return db.query(alterSql, (alterErr) => {
					if (alterErr && alterErr.code !== 'ER_DUP_FIELDNAME') {
						const missing = Object.assign(new Error('Category column missing'), { code: 'CATEGORY_COLUMN_MISSING' });
						return callback(missing);
					}
					// Retry update after adding/confirming column
					return db.query(sql, [category, productId], (retryErr, retryRes) => callback(retryErr, retryRes));
				});
			}
			callback(err, result);
		});
	}
};

module.exports = Product;



