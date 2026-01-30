const checkAuthenticated = (req, res, next) => {
    if (req.session.user) return next();
    req.flash('error', 'Please log in to view this resource');
    res.redirect('/login');
};

const checkAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'admin') return next();
    req.flash('error', 'Access denied');
    res.redirect('/shopping');
};

const checkUser = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'user') return next();
    req.flash('error', 'Access denied');
    res.redirect('/inventory');
};

module.exports = { checkAuthenticated, checkAdmin, checkUser };
