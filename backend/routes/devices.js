const express = require('express');
const router = express.Router();
const { authenticateToken, authorize, authenticateDevice } = require('../middleware/auth');
const { AppError, catchAsync, calculateDistance } = require('../utils/helpers');
const Device = require('../models/Device');
const TrackingData = require('../models/TrackingData');
const Settings = require('../models/Settings');

// Protected routes - require authentication
router.use(authenticateToken);

// Get all devices
router.get('/', catchAsync(async (req, res) => {
    const devices = await Device.find()
        .populate('assignedTo', 'username email')
        .select('-__v');

    res.json({
        status: 'success',
        results: devices.length,
        data: devices
    });
}));

// Get single device
router.get('/:imei', catchAsync(async (req, res) => {
    const device = await Device.findOne({ imei: req.params.imei })
        .populate('assignedTo', 'username email');

    if (!device) {
        throw new AppError('Device not found', 404);
    }

    res.json({
        status: 'success',
        data: device
    });
}));

// Create new device (Admin only)
router.post('/', authorize('admin'), catchAsync(async (req, res) => {
    const { imei, name, description } = req.body;

    // Validate IMEI
    if (!imei || !/^\d{15}$/.test(imei)) {
        throw new AppError('Please provide a valid 15-digit IMEI number', 400);
    }

    // Check for duplicate IMEI
    const existingDevice = await Device.findOne({ imei });
    if (existingDevice) {
        throw new AppError('Device with this IMEI already exists', 400);
    }

    const device = await Device.create({
        imei,
        name,
        description,
        status: 'ACTIVE'
    });

    res.status(201).json({
        status: 'success',
        data: device
    });
}));

// Update device
router.patch('/:imei', authorize('admin', 'operator'), catchAsync(async (req, res) => {
    const allowedUpdates = ['name', 'description', 'status', 'assignedTo', 'geofence', 'settings'];
    const updates = Object.keys(req.body);
    
    // Validate update fields
    const isValidOperation = updates.every(update => allowedUpdates.includes(update));
    if (!isValidOperation) {
        throw new AppError('Invalid updates', 400);
    }

    const device = await Device.findOne({ imei: req.params.imei });
    if (!device) {
        throw new AppError('Device not found', 404);
    }

    updates.forEach(update => device[update] = req.body[update]);
    await device.save();

    res.json({
        status: 'success',
        data: device
    });
}));

// Delete device (Admin only)
router.delete('/:imei', authorize('admin'), catchAsync(async (req, res) => {
    const device = await Device.findOneAndDelete({ imei: req.params.imei });
    
    if (!device) {
        throw new AppError('Device not found', 404);
    }

    // Delete associated tracking data
    await TrackingData.deleteMany({ imei: req.params.imei });

    res.json({
        status: 'success',
        message: 'Device deleted successfully'
    });
}));

// Get device location history
router.get('/:imei/history', catchAsync(async (req, res) => {
    const { start, end, limit = 1000 } = req.query;
    
    const query = { imei: req.params.imei };
    
    if (start && end) {
        query.timestamp = {
            $gte: new Date(start),
            $lte: new Date(end)
        };
    }

    const history = await TrackingData.find(query)
        .sort('-timestamp')
        .limit(parseInt(limit));

    res.json({
        status: 'success',
        results: history.length,
        data: history
    });
}));

// Update device location (Device authenticated)
router.post('/:imei/location', authenticateDevice, catchAsync(async (req, res) => {
    const { latitude, longitude, altitude, speed, heading, battery, signal } = req.body;
    const { imei } = req.params;

    // Validate coordinates
    if (!latitude || !longitude) {
        throw new AppError('Latitude and longitude are required', 400);
    }

    // Create tracking data entry
    const trackingData = await TrackingData.create({
        imei,
        latitude,
        longitude,
        altitude,
        speed,
        heading,
        battery,
        signal,
        timestamp: new Date()
    });

    // Update device location
    const device = await Device.findOne({ imei });
    device.latitude = latitude;
    device.longitude = longitude;
    device.altitude = altitude || device.altitude;
    device.speed = speed || device.speed;
    device.heading = heading || device.heading;
    device.battery = battery || device.battery;
    device.signal = signal || device.signal;
    device.lastSeen = new Date();
    device.online = true;

    // Check geofence if enabled
    if (device.geofence.enabled) {
        const distance = calculateDistance(
            latitude,
            longitude,
            device.geofence.center.latitude,
            device.geofence.center.longitude
        );

        const isWithinGeofence = distance <= device.geofence.radius;
        const wasWithinGeofence = device.isWithinGeofence();

        if (isWithinGeofence !== wasWithinGeofence) {
            // Geofence status changed
            const eventType = isWithinGeofence ? 'GEOFENCE_ENTER' : 'GEOFENCE_EXIT';
            await TrackingData.create({
                imei,
                latitude,
                longitude,
                event: {
                    type: eventType,
                    description: `Device ${eventType === 'GEOFENCE_ENTER' ? 'entered' : 'exited'} geofence`
                }
            });
        }
    }

    await device.save();

    res.json({
        status: 'success',
        data: trackingData
    });
}));

// Send remote shutdown command
router.post('/:imei/shutdown', authorize('admin', 'operator'), catchAsync(async (req, res) => {
    const device = await Device.findOne({ imei: req.params.imei });
    
    if (!device) {
        throw new AppError('Device not found', 404);
    }

    device.shutdownRequested = true;
    device.shutdownRequestedBy = req.user.username;
    device.shutdownRequestedAt = new Date();
    await device.save();

    // Create shutdown event
    await TrackingData.create({
        imei: device.imei,
        latitude: device.latitude,
        longitude: device.longitude,
        event: {
            type: 'DEVICE_SHUTDOWN',
            description: `Remote shutdown requested by ${req.user.username}`
        }
    });

    res.json({
        status: 'success',
        message: 'Shutdown command sent successfully'
    });
}));

// Check shutdown status (Device authenticated)
router.get('/:imei/shutdown-status', authenticateDevice, catchAsync(async (req, res) => {
    const device = await Device.findOne({ imei: req.params.imei });
    
    if (!device) {
        throw new AppError('Device not found', 404);
    }

    const shouldShutdown = device.shutdownRequested;
    
    if (shouldShutdown) {
        // Clear shutdown flag
        device.shutdownRequested = false;
        device.shutdownExecutedAt = new Date();
        device.online = false;
        await device.save();
    }

    res.json({
        status: 'success',
        shutdown: shouldShutdown
    });
}));

// Get device statistics
router.get('/:imei/stats', catchAsync(async (req, res) => {
    const { start, end } = req.query;
    const imei = req.params.imei;

    const device = await Device.findOne({ imei });
    if (!device) {
        throw new AppError('Device not found', 404);
    }

    const stats = await TrackingData.getMovementSummary(imei, new Date(start), new Date(end));

    res.json({
        status: 'success',
        data: stats
    });
}));

module.exports = router;
