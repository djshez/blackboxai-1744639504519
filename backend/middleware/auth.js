const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { AppError } = require('../utils/helpers');

// Authenticate JWT token
exports.authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            throw new AppError('Authentication required', 401);
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        const user = await User.findById(decoded.id).select('-password');

        if (!user || !user.active) {
            throw new AppError('User not found or inactive', 401);
        }

        req.user = user;
        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            next(new AppError('Invalid token', 401));
        } else if (error.name === 'TokenExpiredError') {
            next(new AppError('Token expired', 401));
        } else {
            next(error);
        }
    }
};

// Role-based authorization
exports.authorize = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return next(new AppError('Not authorized to access this route', 403));
        }
        next();
    };
};

// Rate limiting middleware
const rateLimit = new Map();
exports.rateLimiter = (windowMs = 900000, max = 100) => {
    return (req, res, next) => {
        const ip = req.ip;
        const now = Date.now();
        const windowStart = now - windowMs;

        if (!rateLimit.has(ip)) {
            rateLimit.set(ip, []);
        }

        const requests = rateLimit.get(ip);
        const recentRequests = requests.filter(time => time > windowStart);

        if (recentRequests.length >= max) {
            return next(new AppError('Too many requests', 429));
        }

        recentRequests.push(now);
        rateLimit.set(ip, recentRequests);

        next();
    };
};

// Device authentication middleware
exports.authenticateDevice = async (req, res, next) => {
    try {
        const imei = req.headers['x-device-imei'];
        
        if (!imei) {
            throw new AppError('Device IMEI required', 401);
        }

        const device = await Device.findOne({ imei });
        
        if (!device) {
            throw new AppError('Device not found', 401);
        }

        if (device.status !== 'ACTIVE') {
            throw new AppError('Device is not active', 403);
        }

        req.device = device;
        next();
    } catch (error) {
        next(error);
    }
};

// Activity logging middleware
exports.logActivity = async (req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        const log = {
            timestamp: new Date(),
            user: req.user ? req.user.username : 'anonymous',
            method: req.method,
            path: req.path,
            status: res.statusCode,
            duration,
            ip: req.ip
        };
        
        // Log to console in development
        if (process.env.NODE_ENV === 'development') {
            console.log(JSON.stringify(log));
        }
        
        // Could also save to database or log file
    });
    next();
};

// Session management middleware
exports.checkSession = async (req, res, next) => {
    try {
        if (!req.user) {
            return next();
        }

        const settings = await Settings.getSettings();
        const sessionTimeout = settings.security.sessionTimeout * 1000; // Convert to milliseconds
        const lastActivity = req.user.lastActivity || req.user.lastLogin;

        if (lastActivity && Date.now() - lastActivity > sessionTimeout) {
            throw new AppError('Session expired', 401);
        }

        // Update last activity
        await User.findByIdAndUpdate(req.user._id, {
            lastActivity: Date.now()
        });

        next();
    } catch (error) {
        next(error);
    }
};

// Password expiry check middleware
exports.checkPasswordExpiry = async (req, res, next) => {
    try {
        if (!req.user) {
            return next();
        }

        const settings = await Settings.getSettings();
        const passwordExpiry = settings.security.passwordPolicy.passwordExpiry;

        if (passwordExpiry > 0) {
            const lastPasswordChange = req.user.lastPasswordChange || req.user.createdAt;
            const daysElapsed = (Date.now() - lastPasswordChange) / (1000 * 60 * 60 * 24);

            if (daysElapsed > passwordExpiry) {
                throw new AppError('Password expired. Please change your password.', 401);
            }
        }

        next();
    } catch (error) {
        next(error);
    }
};

// Maintenance mode middleware
exports.checkMaintenance = async (req, res, next) => {
    try {
        const settings = await Settings.getSettings();
        
        if (settings.system.maintenance.enabled) {
            // Allow admin users to access during maintenance
            if (req.user && req.user.role === 'admin') {
                return next();
            }

            throw new AppError(
                settings.system.maintenance.message || 'System is under maintenance',
                503
            );
        }

        next();
    } catch (error) {
        next(error);
    }
};
