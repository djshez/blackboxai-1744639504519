const express = require('express');
const router = express.Router();
const { authenticateToken, authorize } = require('../middleware/auth');
const { AppError, catchAsync } = require('../utils/helpers');
const Settings = require('../models/Settings');

// All routes require authentication
router.use(authenticateToken);

// Get all settings
router.get('/', catchAsync(async (req, res) => {
    const settings = await Settings.getSettings();
    
    // Remove sensitive information for non-admin users
    if (req.user.role !== 'admin') {
        settings.notifications.email.server = undefined;
        settings.notifications.sms.provider = undefined;
        settings.notifications.push.vapidKeys = undefined;
        settings.security = undefined;
    }

    res.json({
        status: 'success',
        data: settings
    });
}));

// Update settings (Admin only)
router.patch('/', authorize('admin'), catchAsync(async (req, res) => {
    const updates = req.body;
    
    // Validate email configuration if enabled
    if (updates.notifications?.email?.enabled) {
        const { server, sender } = updates.notifications.email;
        if (!server?.host || !server?.port || !server?.auth?.user || !server?.auth?.pass || !sender?.email) {
            throw new AppError('Invalid email configuration', 400);
        }
    }

    // Validate SMS configuration if enabled
    if (updates.notifications?.sms?.enabled) {
        const { provider } = updates.notifications.sms;
        if (!provider?.name || !provider?.apiKey || !provider?.apiSecret) {
            throw new AppError('Invalid SMS configuration', 400);
        }
    }

    // Update settings
    const settings = await Settings.findOneAndUpdate(
        {},
        { $set: updates },
        { 
            new: true, 
            upsert: true,
            runValidators: true 
        }
    );

    res.json({
        status: 'success',
        data: settings
    });
}));

// Test email configuration
router.post('/test-email', authorize('admin'), catchAsync(async (req, res) => {
    const settings = await Settings.getSettings();
    
    if (!settings.notifications.email.enabled) {
        throw new AppError('Email notifications are not enabled', 400);
    }

    const { testEmail } = req.body;
    if (!testEmail) {
        throw new AppError('Please provide a test email address', 400);
    }

    try {
        await sendEmail(
            testEmail,
            'Test Email from Trax GPS Tracker',
            'This is a test email to verify your email configuration.'
        );

        res.json({
            status: 'success',
            message: 'Test email sent successfully'
        });
    } catch (error) {
        throw new AppError(`Failed to send test email: ${error.message}`, 500);
    }
}));

// Test SMS configuration
router.post('/test-sms', authorize('admin'), catchAsync(async (req, res) => {
    const settings = await Settings.getSettings();
    
    if (!settings.notifications.sms.enabled) {
        throw new AppError('SMS notifications are not enabled', 400);
    }

    const { testPhone } = req.body;
    if (!testPhone) {
        throw new AppError('Please provide a test phone number', 400);
    }

    try {
        await sendSMS(
            testPhone,
            'Test SMS from Trax GPS Tracker'
        );

        res.json({
            status: 'success',
            message: 'Test SMS sent successfully'
        });
    } catch (error) {
        throw new AppError(`Failed to send test SMS: ${error.message}`, 500);
    }
}));

// Update map settings
router.patch('/map', authorize('admin'), catchAsync(async (req, res) => {
    const { provider, apiKey, style, defaultCenter } = req.body;

    const settings = await Settings.findOneAndUpdate(
        {},
        {
            $set: {
                'map.provider': provider,
                'map.apiKey': apiKey,
                'map.style': style,
                'map.defaultCenter': defaultCenter
            }
        },
        { new: true, upsert: true }
    );

    res.json({
        status: 'success',
        data: settings.map
    });
}));

// Update security settings
router.patch('/security', authorize('admin'), catchAsync(async (req, res) => {
    const { sessionTimeout, maxLoginAttempts, lockoutDuration, passwordPolicy } = req.body;

    const settings = await Settings.findOneAndUpdate(
        {},
        {
            $set: {
                'security.sessionTimeout': sessionTimeout,
                'security.maxLoginAttempts': maxLoginAttempts,
                'security.lockoutDuration': lockoutDuration,
                'security.passwordPolicy': passwordPolicy
            }
        },
        { new: true, upsert: true }
    );

    res.json({
        status: 'success',
        data: settings.security
    });
}));

// Update notification settings
router.patch('/notifications', authorize('admin'), catchAsync(async (req, res) => {
    const settings = await Settings.findOneAndUpdate(
        {},
        { $set: { notifications: req.body } },
        { new: true, upsert: true }
    );

    res.json({
        status: 'success',
        data: settings.notifications
    });
}));

// Update alert settings
router.patch('/alerts', authorize('admin'), catchAsync(async (req, res) => {
    const settings = await Settings.findOneAndUpdate(
        {},
        { $set: { alerts: req.body } },
        { new: true, upsert: true }
    );

    res.json({
        status: 'success',
        data: settings.alerts
    });
}));

// Update data retention settings
router.patch('/data-retention', authorize('admin'), catchAsync(async (req, res) => {
    const settings = await Settings.findOneAndUpdate(
        {},
        { $set: { dataRetention: req.body } },
        { new: true, upsert: true }
    );

    res.json({
        status: 'success',
        data: settings.dataRetention
    });
}));

// Toggle maintenance mode
router.post('/maintenance', authorize('admin'), catchAsync(async (req, res) => {
    const { enabled, message, scheduledStart, scheduledEnd } = req.body;

    const settings = await Settings.findOneAndUpdate(
        {},
        {
            $set: {
                'system.maintenance': {
                    enabled,
                    message,
                    scheduledStart,
                    scheduledEnd
                }
            }
        },
        { new: true, upsert: true }
    );

    res.json({
        status: 'success',
        data: settings.system.maintenance
    });
}));

// Get system status
router.get('/status', authorize('admin'), catchAsync(async (req, res) => {
    // Get various system metrics
    const deviceCount = await Device.countDocuments();
    const activeDevices = await Device.countDocuments({ online: true });
    const userCount = await User.countDocuments();
    const trackingDataCount = await TrackingData.countDocuments();

    // Get database size and stats
    const dbStats = await mongoose.connection.db.stats();

    res.json({
        status: 'success',
        data: {
            devices: {
                total: deviceCount,
                active: activeDevices
            },
            users: userCount,
            trackingData: trackingDataCount,
            database: {
                size: dbStats.dataSize,
                collections: dbStats.collections,
                indexes: dbStats.indexes
            },
            system: {
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                nodeVersion: process.version
            }
        }
    });
}));

module.exports = router;
