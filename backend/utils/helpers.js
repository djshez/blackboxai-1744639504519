const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');

// Authentication helpers
const generateToken = (user) => {
    return jwt.sign(
        { 
            id: user._id, 
            username: user.username, 
            role: user.role 
        },
        process.env.JWT_SECRET || 'your-secret-key',
        { 
            expiresIn: process.env.JWT_EXPIRATION || '24h' 
        }
    );
};

const verifyToken = (token) => {
    try {
        return jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    } catch (error) {
        return null;
    }
};

const hashPassword = async (password) => {
    const salt = await bcrypt.genSalt(parseInt(process.env.BCRYPT_SALT_ROUNDS) || 10);
    return bcrypt.hash(password, salt);
};

// Geolocation helpers
const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c; // Distance in meters
};

const calculateBearing = (lat1, lon1, lat2, lon2) => {
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const λ1 = lon1 * Math.PI / 180;
    const λ2 = lon2 * Math.PI / 180;

    const y = Math.sin(λ2 - λ1) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) -
             Math.sin(φ1) * Math.cos(φ2) * Math.cos(λ2 - λ1);
    const θ = Math.atan2(y, x);

    return ((θ * 180 / Math.PI + 360) % 360); // Bearing in degrees
};

// Notification helpers
const emailTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT),
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

const sendEmail = async (to, subject, html) => {
    try {
        await emailTransporter.sendMail({
            from: process.env.SMTP_FROM,
            to,
            subject,
            html
        });
        return true;
    } catch (error) {
        console.error('Error sending email:', error);
        return false;
    }
};

const sendSMS = async (to, message) => {
    // Implement SMS sending logic based on your provider
    // This is a placeholder for demonstration
    try {
        console.log(`Sending SMS to ${to}: ${message}`);
        return true;
    } catch (error) {
        console.error('Error sending SMS:', error);
        return false;
    }
};

// Data formatting helpers
const formatDate = (date, format = 'YYYY-MM-DD HH:mm:ss') => {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');

    return format
        .replace('YYYY', year)
        .replace('MM', month)
        .replace('DD', day)
        .replace('HH', hours)
        .replace('mm', minutes)
        .replace('ss', seconds);
};

const formatSpeed = (speedInMetersPerSecond, unit = 'km/h') => {
    if (unit === 'km/h') {
        return (speedInMetersPerSecond * 3.6).toFixed(1);
    } else if (unit === 'mph') {
        return (speedInMetersPerSecond * 2.237).toFixed(1);
    }
    return speedInMetersPerSecond.toFixed(1);
};

const formatDistance = (distanceInMeters, unit = 'km') => {
    if (unit === 'km') {
        return (distanceInMeters / 1000).toFixed(2);
    } else if (unit === 'mi') {
        return (distanceInMeters / 1609.34).toFixed(2);
    }
    return distanceInMeters.toFixed(0);
};

// Validation helpers
const isValidIMEI = (imei) => {
    return /^\d{15}$/.test(imei);
};

const isValidEmail = (email) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

const isValidPhone = (phone) => {
    return /^\+?[\d\s-]{10,}$/.test(phone);
};

// Error handling helpers
class AppError extends Error {
    constructor(message, statusCode = 500) {
        super(message);
        this.statusCode = statusCode;
        this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
        this.isOperational = true;

        Error.captureStackTrace(this, this.constructor);
    }
}

const catchAsync = (fn) => {
    return (req, res, next) => {
        fn(req, res, next).catch(next);
    };
};

// Rate limiting helper
const createRateLimiter = (windowMs = 900000, max = 100) => {
    const requests = new Map();

    return (ip) => {
        const now = Date.now();
        const windowStart = now - windowMs;

        // Clean old requests
        for (const [key, timestamp] of requests) {
            if (timestamp < windowStart) {
                requests.delete(key);
            }
        }

        // Count requests in current window
        const requestCount = Array.from(requests.values())
            .filter(timestamp => timestamp > windowStart)
            .length;

        if (requestCount >= max) {
            return false;
        }

        requests.set(now, now);
        return true;
    };
};

module.exports = {
    // Authentication
    generateToken,
    verifyToken,
    hashPassword,

    // Geolocation
    calculateDistance,
    calculateBearing,

    // Notifications
    sendEmail,
    sendSMS,

    // Data formatting
    formatDate,
    formatSpeed,
    formatDistance,

    // Validation
    isValidIMEI,
    isValidEmail,
    isValidPhone,

    // Error handling
    AppError,
    catchAsync,

    // Rate limiting
    createRateLimiter
};
