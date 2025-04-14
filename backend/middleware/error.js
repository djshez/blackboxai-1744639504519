const { AppError } = require('../utils/helpers');

// Error handling middleware
const errorHandler = (err, req, res, next) => {
    err.statusCode = err.statusCode || 500;
    err.status = err.status || 'error';

    if (process.env.NODE_ENV === 'development') {
        sendErrorDev(err, res);
    } else {
        let error = { ...err };
        error.message = err.message;

        // Mongoose duplicate key error
        if (error.code === 11000) {
            error = handleDuplicateKeyError(error);
        }

        // Mongoose validation error
        if (error.name === 'ValidationError') {
            error = handleValidationError(error);
        }

        // Mongoose cast error
        if (error.name === 'CastError') {
            error = handleCastError(error);
        }

        // JWT errors
        if (error.name === 'JsonWebTokenError') {
            error = handleJWTError();
        }

        if (error.name === 'TokenExpiredError') {
            error = handleJWTExpiredError();
        }

        sendErrorProd(error, res);
    }
};

// Development error response
const sendErrorDev = (err, res) => {
    res.status(err.statusCode).json({
        status: err.status,
        error: err,
        message: err.message,
        stack: err.stack
    });
};

// Production error response
const sendErrorProd = (err, res) => {
    // Operational, trusted error: send message to client
    if (err.isOperational) {
        res.status(err.statusCode).json({
            status: err.status,
            message: err.message
        });
    } 
    // Programming or other unknown error: don't leak error details
    else {
        // Log error for debugging
        console.error('ERROR 💥:', err);

        res.status(500).json({
            status: 'error',
            message: 'Something went wrong'
        });
    }
};

// Handle duplicate key errors
const handleDuplicateKeyError = (err) => {
    const field = Object.keys(err.keyValue)[0];
    const value = err.keyValue[field];
    const message = `Duplicate field value: ${value}. Please use another value for ${field}.`;
    return new AppError(message, 400);
};

// Handle validation errors
const handleValidationError = (err) => {
    const errors = Object.values(err.errors).map(el => el.message);
    const message = `Invalid input data. ${errors.join('. ')}`;
    return new AppError(message, 400);
};

// Handle cast errors
const handleCastError = (err) => {
    const message = `Invalid ${err.path}: ${err.value}`;
    return new AppError(message, 400);
};

// Handle JWT errors
const handleJWTError = () => {
    return new AppError('Invalid token. Please log in again.', 401);
};

// Handle JWT expired errors
const handleJWTExpiredError = () => {
    return new AppError('Your token has expired. Please log in again.', 401);
};

// Handle uncaught exceptions
process.on('uncaughtException', err => {
    console.error('UNCAUGHT EXCEPTION! 💥 Shutting down...');
    console.error(err.name, err.message);
    console.error(err.stack);
    process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', err => {
    console.error('UNHANDLED REJECTION! 💥 Shutting down...');
    console.error(err.name, err.message);
    console.error(err.stack);
    process.exit(1);
});

// Handle SIGTERM signal
process.on('SIGTERM', () => {
    console.log('👋 SIGTERM RECEIVED. Shutting down gracefully');
    process.exit(0);
});

// Not Found handler
const notFound = (req, res, next) => {
    next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
};

// Async error wrapper
const catchAsync = fn => {
    return (req, res, next) => {
        fn(req, res, next).catch(next);
    };
};

// Request validation middleware
const validateRequest = (schema) => {
    return (req, res, next) => {
        const { error } = schema.validate(req.body);
        if (error) {
            const message = error.details.map(detail => detail.message).join(', ');
            return next(new AppError(message, 400));
        }
        next();
    };
};

// Response sanitization middleware
const sanitizeResponse = (req, res, next) => {
    const originalSend = res.send;
    res.send = function(body) {
        // Remove sensitive data
        if (body && typeof body === 'object') {
            delete body.password;
            delete body.__v;
            // Add more fields to remove as needed
        }
        originalSend.call(this, body);
    };
    next();
};

// Request logging middleware
const logRequest = (req, res, next) => {
    if (process.env.NODE_ENV === 'development') {
        console.log(`${req.method} ${req.originalUrl}`);
        if (Object.keys(req.body).length) {
            console.log('Request Body:', req.body);
        }
        if (Object.keys(req.query).length) {
            console.log('Query Params:', req.query);
        }
    }
    next();
};

module.exports = {
    errorHandler,
    notFound,
    catchAsync,
    validateRequest,
    sanitizeResponse,
    logRequest
};
