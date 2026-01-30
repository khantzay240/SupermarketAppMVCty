const Review = require('../models/Review');

const ReviewController = {
    showForm(req, res) {
        Review.getAll((err, reviews) => {
            if (err) {
                if (err.code === 'REVIEWS_TABLE_MISSING') {
                    req.flash('error', 'Reviews table missing. Please run: CREATE TABLE reviews (id INT AUTO_INCREMENT PRIMARY KEY, user_id INT, content TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL);');
                } else {
                    console.error('Error fetching reviews:', err);
                    req.flash('error', 'Unable to load reviews.');
                }
            }
            res.render('reviews', {
                user: req.session.user,
                reviews: reviews || [],
                messages: req.flash('success'),
                errors: req.flash('error')
            });
        });
    },

    submit(req, res) {
        const content = (req.body.content || '').trim();
        if (!content) {
            req.flash('error', 'Review cannot be empty.');
            return res.redirect('/reviews');
        }
        Review.add(req.session.user.id, content, (err) => {
            if (err) {
                if (err.code === 'REVIEWS_TABLE_MISSING') {
                    req.flash('error', 'Reviews table missing. Please run: CREATE TABLE reviews (id INT AUTO_INCREMENT PRIMARY KEY, user_id INT, content TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL);');
                } else {
                    console.error('Error saving review:', err);
                    req.flash('error', 'Unable to save review.');
                }
                return res.redirect('/reviews');
            }
            req.flash('success', 'Review submitted. Thank you!');
            return res.redirect('/reviews');
        });
    },

    adminList(req, res) {
        Review.getAll((err, reviews) => {
            if (err) {
                if (err.code === 'REVIEWS_TABLE_MISSING') {
                    req.flash('error', 'Reviews table missing. Please run: CREATE TABLE reviews (id INT AUTO_INCREMENT PRIMARY KEY, user_id INT, content TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL);');
                } else {
                    console.error('Error fetching reviews:', err);
                    req.flash('error', 'Unable to load reviews.');
                }
            }
            res.render('reviews-admin', {
                user: req.session.user,
                reviews: reviews || [],
                messages: req.flash('success'),
                errors: req.flash('error')
            });
        });
    }
};

module.exports = ReviewController;
