const User = require('../models/User');
const Order = require('../models/Order');

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

const UserController = {
    showRegister(req, res) {
        res.render('register', { messages: req.flash('error'), formData: req.flash('formData')[0] });
    },

    register(req, res) {
        const { username, email, password, address, contact, role } = req.body;
        const user = { username, email, password, address, contact, role };
        User.create(user, (err) => {
            if (err) throw err;
            req.flash('success', 'Registration successful! Please log in.');
            res.redirect('/login');
        });
    },

    showLogin(req, res) {
        res.render('login', { messages: req.flash('success'), errors: req.flash('error') });
    },

    login(req, res) {
        const { email, password } = req.body;
        if (!email || !password) {
            req.flash('error', 'All fields are required.');
            return res.redirect('/login');
        }

        User.findByCredentials(email, password, (err, user) => {
            if (err) throw err;
            if (!user) {
                req.flash('error', 'Invalid email or password.');
                return res.redirect('/login');
            }
            req.session.user = user;
            req.flash('success', 'Login successful!');
            if (user.role === 'user') return res.redirect('/shopping');
            return res.redirect('/inventory');
        });
    },

    logout(req, res) {
        req.session.destroy(() => res.redirect('/'));
    },

    list(req, res) {
        User.getAll((err, users) => {
            if (err) {
                console.error('Error fetching users:', err);
                return res.status(500).send('Database error');
            }
            res.render('users', { users: users || [], user: req.session.user });
        });
    },

    manage(req, res) {
        const userId = parseInt(req.params.id, 10);
        User.getById(userId, (err, targetUser) => {
            if (err) {
                console.error('Error fetching user:', err);
                return res.status(500).send('Database error');
            }
            if (!targetUser) return res.status(404).send('User not found');
            if (targetUser.role !== 'user') {
                req.flash('error', 'Only user accounts can be managed here.');
                return res.redirect('/users');
            }

            Order.getOrdersWithItemsByUser(userId, (orderErr, orders, itemsByOrder) => {
                if (orderErr) {
                    console.error('Error fetching orders:', orderErr);
                    req.flash('error', 'Unable to load orders.');
                    return res.render('manage-user', { targetUser, user: req.session.user, messages: req.flash('success'), errors: req.flash('error'), orders: [], itemsByOrder: {} });
                }
                res.render('manage-user', { targetUser, user: req.session.user, messages: req.flash('success'), errors: req.flash('error'), orders: orders || [], itemsByOrder: itemsByOrder || {} });
            });
        });
    },

    update(req, res) {
        const userId = parseInt(req.params.id, 10);
        const { username, email, address, contact, role } = req.body;
        const user = { username, email, address, contact, role };

        User.update(userId, user, (err) => {
            if (err) {
                console.error('Error updating user:', err);
                req.flash('error', 'Unable to update user.');
                return res.redirect(`/users/${userId}`);
            }
            req.flash('success', 'User updated successfully.');
            return res.redirect(`/users/${userId}`);
        });
    },

    delete(req, res) {
        const userId = parseInt(req.params.id, 10);
        User.delete(userId, (err) => {
            if (err) {
                console.error('Error deleting user:', err);
                req.flash('error', 'Unable to delete user.');
                return res.redirect(`/users/${userId}`);
            }
            req.flash('success', 'User deleted.');
            return res.redirect('/users');
        });
    }
};

module.exports = { UserController, validateRegistration };
