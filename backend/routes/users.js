const express = require('express');
const router = express.Router();
const { authenticateToken, authorize } = require('../middleware/auth');
const { AppError, catchAsync, hashPassword } = require('../utils/helpers');
const User = require('../models/User');

// All routes require authentication
router.use(authenticateToken);

// Get all users (Admin only)
router.get('/', authorize('admin'), catchAsync(async (req, res) => {
    const users = await User.find()
        .select('-password -__v')
        .sort('username');

    res.json({
        status: 'success',
        results: users.length,
        data: users
    });
}));

// Get single user
router.get('/:id', authorize('admin'), catchAsync(async (req, res) => {
    const user = await User.findById(req.params.id)
        .select('-password -__v');

    if (!user) {
        throw new AppError('User not found', 404);
    }

    res.json({
        status: 'success',
        data: user
    });
}));

// Create new user (Admin only)
router.post('/', authorize('admin'), catchAsync(async (req, res) => {
    const {
        username,
        password,
        email,
        role,
        phone,
        notificationPreferences
    } = req.body;

    // Validate required fields
    if (!username || !password || !email) {
        throw new AppError('Please provide username, password and email', 400);
    }

    // Check if username already exists
    const existingUser = await User.findOne({ username });
    if (existingUser) {
        throw new AppError('Username already exists', 400);
    }

    // Check if email already exists
    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
        throw new AppError('Email already exists', 400);
    }

    // Validate password strength
    if (password.length < 8) {
        throw new AppError('Password must be at least 8 characters long', 400);
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create user
    const user = await User.create({
        username,
        password: hashedPassword,
        email,
        role: role || 'viewer',
        phone,
        notificationPreferences,
        active: true
    });

    // Remove sensitive data from response
    user.password = undefined;
    user.__v = undefined;

    res.status(201).json({
        status: 'success',
        data: user
    });
}));

// Update user
router.patch('/:id', authorize('admin'), catchAsync(async (req, res) => {
    const updates = req.body;
    const userId = req.params.id;

    // Prevent password update through this route
    if (updates.password) {
        throw new AppError('Cannot update password through this route', 400);
    }

    // Check if username update is unique
    if (updates.username) {
        const existingUser = await User.findOne({ 
            username: updates.username,
            _id: { $ne: userId }
        });
        if (existingUser) {
            throw new AppError('Username already exists', 400);
        }
    }

    // Check if email update is unique
    if (updates.email) {
        const existingEmail = await User.findOne({ 
            email: updates.email,
            _id: { $ne: userId }
        });
        if (existingEmail) {
            throw new AppError('Email already exists', 400);
        }
    }

    const user = await User.findByIdAndUpdate(
        userId,
        updates,
        { 
            new: true, 
            runValidators: true 
        }
    ).select('-password -__v');

    if (!user) {
        throw new AppError('User not found', 404);
    }

    res.json({
        status: 'success',
        data: user
    });
}));

// Delete user (Admin only)
router.delete('/:id', authorize('admin'), catchAsync(async (req, res) => {
    const user = await User.findById(req.params.id);

    if (!user) {
        throw new AppError('User not found', 404);
    }

    // Prevent deleting the last admin user
    if (user.role === 'admin') {
        const adminCount = await User.countDocuments({ role: 'admin' });
        if (adminCount <= 1) {
            throw new AppError('Cannot delete the last admin user', 400);
        }
    }

    await user.remove();

    res.json({
        status: 'success',
        message: 'User deleted successfully'
    });
}));

// Update own profile
router.patch('/profile/update', authenticateToken, catchAsync(async (req, res) => {
    const updates = req.body;
    const userId = req.user.id;

    // Restrict updatable fields for own profile
    const allowedUpdates = ['email', 'phone', 'notificationPreferences'];
    const updateKeys = Object.keys(updates);
    
    const isValidOperation = updateKeys.every(key => allowedUpdates.includes(key));
    if (!isValidOperation) {
        throw new AppError('Invalid updates', 400);
    }

    // Check if email update is unique
    if (updates.email) {
        const existingEmail = await User.findOne({ 
            email: updates.email,
            _id: { $ne: userId }
        });
        if (existingEmail) {
            throw new AppError('Email already exists', 400);
        }
    }

    const user = await User.findByIdAndUpdate(
        userId,
        updates,
        { 
            new: true, 
            runValidators: true 
        }
    ).select('-password -__v');

    res.json({
        status: 'success',
        data: user
    });
}));

// Get user activity logs
router.get('/:id/activity', authorize('admin'), catchAsync(async (req, res) => {
    const user = await User.findById(req.params.id);
    
    if (!user) {
        throw new AppError('User not found', 404);
    }

    // Get user's device assignments
    const devices = await Device.find({ assignedTo: user._id })
        .select('imei name');

    // Get recent tracking data for assigned devices
    const deviceImeis = devices.map(device => device.imei);
    const recentActivity = await TrackingData.find({
        imei: { $in: deviceImeis },
        timestamp: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // Last 7 days
    })
    .sort('-timestamp')
    .limit(100);

    res.json({
        status: 'success',
        data: {
            devices,
            recentActivity
        }
    });
}));

// Toggle user active status
router.patch('/:id/toggle-status', authorize('admin'), catchAsync(async (req, res) => {
    const user = await User.findById(req.params.id);
    
    if (!user) {
        throw new AppError('User not found', 404);
    }

    // Prevent deactivating the last admin user
    if (user.role === 'admin' && user.active) {
        const activeAdminCount = await User.countDocuments({ 
            role: 'admin',
            active: true
        });
        if (activeAdminCount <= 1) {
            throw new AppError('Cannot deactivate the last active admin user', 400);
        }
    }

    user.active = !user.active;
    await user.save();

    res.json({
        status: 'success',
        data: {
            id: user._id,
            username: user.username,
            active: user.active
        }
    });
}));

// Get user notification settings
router.get('/notifications/settings', authenticateToken, catchAsync(async (req, res) => {
    const user = await User.findById(req.user.id)
        .select('notificationPreferences email phone');

    res.json({
        status: 'success',
        data: user
    });
}));

// Update user notification settings
router.patch('/notifications/settings', authenticateToken, catchAsync(async (req, res) => {
    const { notificationPreferences } = req.body;

    const user = await User.findByIdAndUpdate(
        req.user.id,
        { notificationPreferences },
        { 
            new: true,
            runValidators: true
        }
    ).select('notificationPreferences email phone');

    res.json({
        status: 'success',
        data: user
    });
}));

module.exports = router;
