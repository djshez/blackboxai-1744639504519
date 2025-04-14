const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { generateToken, AppError, catchAsync } = require('../utils/helpers');
const { authenticateToken, rateLimiter } = require('../middleware/auth');
const User = require('../models/User');

// Apply rate limiting to auth routes
router.use(rateLimiter(15 * 60 * 1000, 100)); // 100 requests per 15 minutes

// Login route
router.post('/login', catchAsync(async (req, res) => {
    const { username, password } = req.body;

    // Validate input
    if (!username || !password) {
        throw new AppError('Please provide username and password', 400);
    }

    // Find user
    const user = await User.findOne({ username });
    if (!user || !user.active) {
        throw new AppError('Invalid credentials', 401);
    }

    // Check password
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
        throw new AppError('Invalid credentials', 401);
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate token
    const token = generateToken(user);

    res.json({
        status: 'success',
        token,
        user: {
            id: user._id,
            username: user.username,
            role: user.role,
            email: user.email
        }
    });
}));

// Change password route
router.post('/change-password', authenticateToken, catchAsync(async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    // Validate input
    if (!currentPassword || !newPassword) {
        throw new AppError('Please provide current and new password', 400);
    }

    // Find user
    const user = await User.findById(req.user.id);
    if (!user) {
        throw new AppError('User not found', 404);
    }

    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
        throw new AppError('Current password is incorrect', 401);
    }

    // Validate new password
    if (newPassword.length < 8) {
        throw new AppError('Password must be at least 8 characters long', 400);
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    user.password = hashedPassword;
    user.lastPasswordChange = new Date();
    await user.save();

    res.json({
        status: 'success',
        message: 'Password changed successfully'
    });
}));

// Reset password request route
router.post('/reset-password-request', catchAsync(async (req, res) => {
    const { email } = req.body;

    // Validate input
    if (!email) {
        throw new AppError('Please provide email address', 400);
    }

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
        // Don't reveal if email exists or not
        res.json({
            status: 'success',
            message: 'If an account exists with this email, a reset link will be sent'
        });
        return;
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
    await user.save();

    // Send reset email
    const resetUrl = `${req.protocol}://${req.get('host')}/reset-password/${resetToken}`;
    try {
        await sendEmail(
            user.email,
            'Password Reset Request',
            `Please click the following link to reset your password: ${resetUrl}`
        );

        res.json({
            status: 'success',
            message: 'Reset link sent to email'
        });
    } catch (error) {
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();

        throw new AppError('Error sending reset email. Please try again later.', 500);
    }
}));

// Reset password route
router.post('/reset-password/:token', catchAsync(async (req, res) => {
    const { password } = req.body;
    const { token } = req.params;

    // Find user with valid reset token
    const user = await User.findOne({
        resetPasswordToken: token,
        resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
        throw new AppError('Invalid or expired reset token', 400);
    }

    // Validate new password
    if (!password || password.length < 8) {
        throw new AppError('Please provide a valid password (min 8 characters)', 400);
    }

    // Update password
    const hashedPassword = await bcrypt.hash(password, 10);
    user.password = hashedPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    user.lastPasswordChange = new Date();
    await user.save();

    res.json({
        status: 'success',
        message: 'Password reset successfully'
    });
}));

// Verify token route
router.get('/verify', authenticateToken, (req, res) => {
    res.json({
        status: 'success',
        user: {
            id: req.user._id,
            username: req.user.username,
            role: req.user.role,
            email: req.user.email
        }
    });
});

// Logout route (for tracking purposes)
router.post('/logout', authenticateToken, catchAsync(async (req, res) => {
    // Update last activity
    await User.findByIdAndUpdate(req.user.id, {
        lastActivity: new Date()
    });

    res.json({
        status: 'success',
        message: 'Logged out successfully'
    });
}));

module.exports = router;
