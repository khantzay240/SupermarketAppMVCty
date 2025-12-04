require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const session = require('express-session');
const flash = require('connect-flash');
const multer = require('multer');
const nodemailer = require('nodemailer');
const app = express();

// Set up multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/images');
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname); 
    }
});

const upload = multer({ storage: storage });

const connection = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

connection.connect((err) => {
    if (err) {
        console.error('Error connecting to MySQL:', err);
        return;
    }
    console.log('Connected to MySQL database');
});

// Set up view engine
app.set('view engine', 'ejs');
//  enable static files
app.use(express.static('public'));
// enable form processing
app.use(express.urlencoded({
    extended: false
}));

//TO DO: Insert code for Session Middleware below 
app.use(session({
    secret: 'secret',
    resave: false,
    saveUninitialized: true,
    // Session expires after 1 week of inactivity
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 } 
}));

app.use(flash());

// Email transporter (configure via .env)
const smtpTransporter = process.env.SMTP_HOST
    ? nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_SECURE === 'true',
        auth: process.env.SMTP_USER ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        } : undefined
    })
    : null;

// Middleware to check if user is logged in
const checkAuthenticated = (req, res, next) => {
    if (req.session.user) {
        return next();
    } else {
        req.flash('error', 'Please log in to view this resource');
        res.redirect('/login');
    }
};

// Middleware to check if user is admin
const checkAdmin = (req, res, next) => {
    if (req.session.user.role === 'admin') {
        return next();
    } else {
        req.flash('error', 'Access denied');
        res.redirect('/shopping');
    }
};

// Middleware to allow only normal users
const checkUser = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'user') {
        return next();
    }
    req.flash('error', 'Access denied');
    res.redirect('/inventory');
};

// Helper to fetch cart items for logged-in users (DB) or session fallback
const fetchCartItems = (req, callback) => {
    const user = req.session.user;
    if (user && user.id) {
        const sql = `
          SELECT p.id AS id, p.productName, p.price, p.image, ci.quantity
          FROM cart_items ci
          JOIN products p ON p.id = ci.product_id
          WHERE ci.user_id = ?
        `;
        connection.query(sql, [user.id], (err, rows) => {
            if (err) return callback(err);
            callback(null, rows || []);
        });
    } else {
        callback(null, req.session.cart || []);
    }
};

// Helper to clear cart after checkout
const clearCart = (req, callback) => {
    const user = req.session.user;
    if (user && user.id) {
        connection.query('DELETE FROM cart_items WHERE user_id = ?', [user.id], (err) => {
            callback(err);
        });
    } else {
        req.session.cart = [];
        callback(null);
    }
};

// Persist order and items in a single transaction
const saveOrder = (userId, orderNumber, cartItems, total, callback) => {
    connection.beginTransaction((err) => {
        if (err) return callback(err);

        const orderSql = 'INSERT INTO orders (order_number, user_id, total) VALUES (?, ?, ?)';
        connection.query(orderSql, [orderNumber, userId, total], (orderErr, orderResult) => {
            if (orderErr) {
                return connection.rollback(() => callback(orderErr));
            }

            const orderId = orderResult.insertId;
            const itemValues = cartItems.map(it => [
                orderId,
                it.id || null,
                it.productName,
                it.price,
                it.quantity
            ]);

            const itemsSql = `
              INSERT INTO order_items (order_id, product_id, product_name, price, quantity)
              VALUES ?
            `;
            connection.query(itemsSql, [itemValues], (itemsErr) => {
                if (itemsErr) {
                    return connection.rollback(() => callback(itemsErr));
                }
                connection.commit((commitErr) => {
                    if (commitErr) {
                        return connection.rollback(() => callback(commitErr));
                    }
                    callback(null, { orderId, orderNumber });
                });
            });
        });
    });
};

// Helper to send a receipt email (logs to console if SMTP not configured)
const sendReceiptEmail = async (user, cartItems, total, orderNumber) => {
    const lines = cartItems.map(it => {
        const price = parseFloat(it.price);
        return `${it.quantity} x ${it.productName} @ $${price.toFixed(2)}`;
    }).join('\n');
    const textBody = `Hi ${user.username},

Thank you for your order ${orderNumber}.

${lines}

Total: $${total.toFixed(2)}
`;

    if (!smtpTransporter) {
        console.log(`[EMAIL][SIMULATED] To: ${user.email}\nOrder ${orderNumber}\n${lines}\nTotal: $${total.toFixed(2)}`);
        return;
    }

    const from = process.env.SMTP_FROM || process.env.SMTP_USER;
    const mailOptions = {
        from,
        to: user.email,
        subject: `Your receipt for order ${orderNumber}`,
        text: textBody
    };

    await smtpTransporter.sendMail(mailOptions);
};

// Middleware for form validation
const validateRegistration = (req, res, next) => {
    const { username, email, password, address, contact, role } = req.body;

    if (!username || !email || !password || !address || !contact || !role) {
        return res.status(400).send('All fields are required.');
    }
    
    if (password.length < 6) {
        req.flash('error', 'Password should be at least 6 or more characters long');
        req.flash('formData', req.body);
        return res.redirect('/register');
    }
    next();
};

// Define routes
app.get('/',  (req, res) => {
    res.render('index', {user: req.session.user} );
});

app.get('/inventory', checkAuthenticated, checkAdmin, (req, res) => {
    // Fetch data from MySQL
    connection.query('SELECT * FROM products', (error, results) => {
      if (error) throw error;
      res.render('inventory', { products: results, user: req.session.user });
    });
});

// Admin: view all users
app.get('/users', checkAuthenticated, checkAdmin, (req, res) => {
    const sql = 'SELECT id, username, email, address, contact, role FROM users ORDER BY id ASC';
    connection.query(sql, (error, results) => {
        if (error) {
            console.error('Error fetching users:', error);
            return res.status(500).send('Database error');
        }
        res.render('users', { users: results || [], user: req.session.user });
    });
});

// Admin: manage a single user (only role "user")
app.get('/users/:id', checkAuthenticated, checkAdmin, (req, res) => {
    const userId = parseInt(req.params.id);
    const sql = 'SELECT id, username, email, address, contact, role FROM users WHERE id = ?';
    connection.query(sql, [userId], (error, rows) => {
        if (error) {
            console.error('Error fetching user:', error);
            return res.status(500).send('Database error');
        }
        if (!rows || rows.length === 0) return res.status(404).send('User not found');
        const target = rows[0];
        if (target.role !== 'user') {
            req.flash('error', 'Only user accounts can be managed here.');
            return res.redirect('/users');
        }
        res.render('manage-user', { targetUser: target, user: req.session.user, messages: req.flash('success'), errors: req.flash('error') });
    });
});

// Admin: update a user
app.post('/users/:id/update', checkAuthenticated, checkAdmin, (req, res) => {
    const userId = parseInt(req.params.id);
    const { username, email, address, contact, role } = req.body;
    const sql = 'UPDATE users SET username = ?, email = ?, address = ?, contact = ?, role = ? WHERE id = ?';
    connection.query(sql, [username, email, address, contact, role, userId], (error) => {
        if (error) {
            console.error('Error updating user:', error);
            req.flash('error', 'Unable to update user.');
            return res.redirect(`/users/${userId}`);
        }
        req.flash('success', 'User updated successfully.');
        return res.redirect(`/users/${userId}`);
    });
});

// Admin: delete a user
app.post('/users/:id/delete', checkAuthenticated, checkAdmin, (req, res) => {
    const userId = parseInt(req.params.id);
    const sql = 'DELETE FROM users WHERE id = ?';
    connection.query(sql, [userId], (error) => {
        if (error) {
            console.error('Error deleting user:', error);
            req.flash('error', 'Unable to delete user.');
            return res.redirect(`/users/${userId}`);
        }
        req.flash('success', 'User deleted.');
        return res.redirect('/users');
    });
});

app.get('/register', (req, res) => {
    res.render('register', { messages: req.flash('error'), formData: req.flash('formData')[0] });
});

app.post('/register', validateRegistration, (req, res) => {

    const { username, email, password, address, contact, role } = req.body;

    const sql = 'INSERT INTO users (username, email, password, address, contact, role) VALUES (?, ?, SHA1(?), ?, ?, ?)';
    connection.query(sql, [username, email, password, address, contact, role], (err, result) => {
        if (err) {
            throw err;
        }
        console.log(result);
        req.flash('success', 'Registration successful! Please log in.');
        res.redirect('/login');
    });
});

app.get('/login', (req, res) => {
    res.render('login', { messages: req.flash('success'), errors: req.flash('error') });
});

app.post('/login', (req, res) => {
    const { email, password } = req.body;

    // Validate email and password
    if (!email || !password) {
        req.flash('error', 'All fields are required.');
        return res.redirect('/login');
    }

    const sql = 'SELECT * FROM users WHERE email = ? AND password = SHA1(?)';
    connection.query(sql, [email, password], (err, results) => {
        if (err) {
            throw err;
        }

        if (results.length > 0) {
            // Successful login
            req.session.user = results[0]; 
            req.flash('success', 'Login successful!');
            if(req.session.user.role == 'user')
                res.redirect('/shopping');
            else
                res.redirect('/inventory');
        } else {
            // Invalid credentials
            req.flash('error', 'Invalid email or password.');
            res.redirect('/login');
        }
    });
});

app.get('/shopping', checkAuthenticated, (req, res) => {
    // Fetch data from MySQL
    connection.query('SELECT * FROM products', (error, results) => {
        if (error) throw error;
        res.render('shopping', { user: req.session.user, products: results });
      });
});

app.post('/add-to-cart/:id', checkAuthenticated, (req, res) => {
    const productId = parseInt(req.params.id);
    const quantity = parseInt(req.body.quantity) || 1;
    const user = req.session.user; // ensure login stores user.id

    if (user && user.id) {
        // Upsert into DB
        const sql = `
          INSERT INTO cart_items (user_id, product_id, quantity)
          VALUES (?, ?, ?)
          ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)
        `;
        connection.query(sql, [user.id, productId, quantity], (err) => {
            if (err) return res.status(500).json({ success: false, message: 'DB error' });
            // return JSON for AJAX or redirect if normal form
            if (req.xhr || req.get('X-Requested-With') === 'XMLHttpRequest') return res.json({ success: true });
            if (req.body.action === 'buy') return res.redirect('/cart');
            return res.redirect('/shopping');
        });
    } else {
        // fallback: session cart (existing behavior)
        if (!req.session.cart) req.session.cart = [];
        const idx = req.session.cart.findIndex(i => i.id === productId);
        if (idx > -1) req.session.cart[idx].quantity += quantity;
        else req.session.cart.push({ id: productId, productName: req.body.productName, price: parseFloat(req.body.price), image: req.body.image, quantity });
        if (req.xhr || req.get('X-Requested-With') === 'XMLHttpRequest') return res.json({ success: true });
        if (req.body.action === 'buy') return res.redirect('/cart');
        return res.redirect('/shopping');
    }
});

app.get('/cart', checkAuthenticated, (req, res) => {
    const user = req.session.user;
    if (user && user.id) {
        const sql = `
          SELECT p.id AS id, p.productName, p.price, p.image, ci.quantity
          FROM cart_items ci
          JOIN products p ON p.id = ci.product_id
          WHERE ci.user_id = ?
        `;
        connection.query(sql, [user.id], (err, rows) => {
            if (err) return res.status(500).send('DB error');
            const cart = rows || [];
            const total = cart.reduce((s, it) => s + it.price * it.quantity, 0);
            res.render('cart', { cart, total, user });
        });
    } else {
        const cart = req.session.cart || [];
        const total = cart.reduce((s, it) => s + it.price * it.quantity, 0);
        res.render('cart', { cart, total, user: req.session.user });
    }
});

app.get('/checkout', checkAuthenticated, checkUser, (req, res) => {
    const user = req.session.user;
    const renderCheckout = (cartItems) => {
        const total = cartItems.reduce((s, it) => s + it.price * it.quantity, 0);
        res.render('checkout', { user, cart: cartItems, total });
    };

    if (user && user.id) {
        const sql = `
          SELECT p.id AS id, p.productName, p.price, p.image, ci.quantity
          FROM cart_items ci
          JOIN products p ON p.id = ci.product_id
          WHERE ci.user_id = ?
        `;
        connection.query(sql, [user.id], (err, rows) => {
            if (err) return res.status(500).send('DB error');
            renderCheckout(rows || []);
        });
    } else {
        renderCheckout(req.session.cart || []);
    }
});

app.post('/checkout/confirm', checkAuthenticated, checkUser, (req, res) => {
    const user = req.session.user;
    fetchCartItems(req, (err, cartItems) => {
        if (err) return res.status(500).send('DB error');
        if (!cartItems || cartItems.length === 0) {
            req.flash('error', 'Your cart is empty.');
            return res.redirect('/cart');
        }

        const total = cartItems.reduce((s, it) => s + it.price * it.quantity, 0);
        const orderNumber = `ORD-${Date.now()}`;

        saveOrder(user.id, orderNumber, cartItems, total, (saveErr, savedOrder) => {
            if (saveErr) {
                console.error('Order save failed:', saveErr);
                return res.status(500).send('Unable to place order');
            }

            // Send receipt (async, non-blocking)
            sendReceiptEmail(user, cartItems, total, orderNumber).catch((emailErr) => {
                console.error('Email send failed:', emailErr);
            });

            // Clear cart after checkout
            clearCart(req, (clearErr) => {
                if (clearErr) return res.status(500).send('DB error');
                // Stash the last order in session for the success page
                req.session.lastOrder = {
                    orderId: savedOrder.orderId,
                    orderNumber,
                    cart: cartItems,
                    total,
                    userSnapshot: {
                        username: user.username,
                        email: user.email,
                        address: user.address,
                        contact: user.contact
                    },
                    placedAt: new Date().toISOString()
                };
                res.redirect('/checkout/success');
            });
        });
    });
});

app.get('/checkout/success', checkAuthenticated, checkUser, (req, res) => {
    const order = req.session.lastOrder;
    if (!order) {
        req.flash('error', 'No recent order found.');
        return res.redirect('/cart');
    }
    res.render('checkout-success', {
        orderId: order.orderId,
        orderNumber: order.orderNumber,
        cart: order.cart,
        total: order.total,
        user: order.userSnapshot,
        placedAt: order.placedAt
    });
});

app.get('/orders', checkAuthenticated, checkUser, (req, res) => {
    const userId = req.session.user.id;
    const ordersSql = `
      SELECT id, order_number, total, placed_at
      FROM orders
      WHERE user_id = ?
      ORDER BY placed_at DESC, id DESC
    `;
    connection.query(ordersSql, [userId], (orderErr, orders) => {
        if (orderErr) return res.status(500).send('DB error');
        if (!orders || orders.length === 0) {
            return res.render('orders', { orders: [], itemsByOrder: {}, user: req.session.user });
        }

        const orderIds = orders.map(o => o.id);
        const itemsSql = `
          SELECT oi.*, p.image
          FROM order_items oi
          LEFT JOIN products p ON p.id = oi.product_id
          WHERE oi.order_id IN (?)
        `;
        connection.query(itemsSql, [orderIds], (itemsErr, items) => {
            if (itemsErr) return res.status(500).send('DB error');
            const itemsByOrder = {};
            (items || []).forEach(it => {
                if (!itemsByOrder[it.order_id]) itemsByOrder[it.order_id] = [];
                itemsByOrder[it.order_id].push(it);
            });
            res.render('orders', { orders, itemsByOrder, user: req.session.user });
        });
    });
});

app.post('/remove-from-cart/:id', checkAuthenticated, (req, res) => {
    const productId = parseInt(req.params.id);
    const user = req.session.user;
    if (user && user.id) {
        connection.query('DELETE FROM cart_items WHERE user_id = ? AND product_id = ?', [user.id, productId], (err) => {
            if (err) req.flash('error', 'DB error');
            res.redirect('/cart');
        });
    } else {
        if (req.session.cart) {
            req.session.cart = req.session.cart.filter(i => i.id !== productId);
        }
        res.redirect('/cart');
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

app.get('/product/:id', checkAuthenticated, (req, res) => {
  // Extract the product ID from the request parameters
  const productId = req.params.id;

  // Fetch data from MySQL based on the product ID
  connection.query('SELECT * FROM products WHERE id = ?', [productId], (error, results) => {
      if (error) throw error;

      // Check if any product with the given ID was found
      if (results.length > 0) {
          // Render HTML page with the product data
          res.render('product', { product: results[0], user: req.session.user  });
      } else {
          // If no product with the given ID was found, render a 404 page or handle it accordingly
          res.status(404).send('Product not found');
      }
  });
});

app.get('/addProduct', checkAuthenticated, checkAdmin, (req, res) => {
    res.render('addProduct', {user: req.session.user } ); 
});

app.post('/addProduct', upload.single('image'),  (req, res) => {
    // Extract product data from the request body
    const { name, quantity, price} = req.body;
    let image;
    if (req.file) {
        image = req.file.filename; // Save only the filename
    } else {
        image = null;
    }

    const sql = 'INSERT INTO products (productName, quantity, price, image) VALUES (?, ?, ?, ?)';
    // Insert the new product into the database
    connection.query(sql , [name, quantity, price, image], (error, results) => {
        if (error) {
            // Handle any error that occurs during the database operation
            console.error("Error adding product:", error);
            res.status(500).send('Error adding product');
        } else {
            // Send a success response
            res.redirect('/inventory');
        }
    });
});

app.get('/updateProduct/:id',checkAuthenticated, checkAdmin, (req,res) => {
    const productId = req.params.id;
    const sql = 'SELECT * FROM products WHERE id = ?';

    // Fetch data from MySQL based on the product ID
    connection.query(sql , [productId], (error, results) => {
        if (error) throw error;

        // Check if any product with the given ID was found
        if (results.length > 0) {
            // Render HTML page with the product data
            res.render('updateProduct', { product: results[0] });
        } else {
            // If no product with the given ID was found, render a 404 page or handle it accordingly
            res.status(404).send('Product not found');
        }
    });
});

app.post('/updateProduct/:id', upload.single('image'), (req, res) => {
    const productId = req.params.id;
    // Extract product data from the request body
    const { name, quantity, price } = req.body;
    let image  = req.body.currentImage; //retrieve current image filename
    if (req.file) { //if new image is uploaded
        image = req.file.filename; // set image to be new image filename
    } 

    const sql = 'UPDATE products SET productName = ? , quantity = ?, price = ?, image =? WHERE id = ?';
    // Insert the new product into the database
    connection.query(sql, [name, quantity, price, image, productId], (error, results) => {
        if (error) {
            // Handle any error that occurs during the database operation
            console.error("Error updating product:", error);
            res.status(500).send('Error updating product');
        } else {
            // Send a success response
            res.redirect('/inventory');
        }
    });
});

app.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
});
