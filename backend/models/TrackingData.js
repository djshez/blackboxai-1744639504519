const mongoose = require('mongoose');

const trackingDataSchema = new mongoose.Schema({
    imei: {
        type: String,
        required: true,
        trim: true,
        match: [/^\d{15}$/, 'Please enter a valid 15-digit IMEI number']
    },
    timestamp: {
        type: Date,
        required: true,
        default: Date.now
    },
    latitude: {
        type: Number,
        required: true,
        min: -90,
        max: 90
    },
    longitude: {
        type: Number,
        required: true,
        min: -180,
        max: 180
    },
    altitude: {
        type: Number,
        default: 0
    },
    speed: {
        type: Number,
        default: 0,
        min: 0
    },
    heading: {
        type: Number,
        default: 0,
        min: 0,
        max: 360
    },
    accuracy: {
        type: Number,
        default: 0,
        min: 0
    },
    battery: {
        level: {
            type: Number,
            min: 0,
            max: 100
        },
        charging: {
            type: Boolean
        }
    },
    signal: {
        strength: {
            type: Number,
            min: 0,
            max: 100
        },
        type: {
            type: String,
            enum: ['NONE', '2G', '3G', '4G', '5G', 'WIFI']
        }
    },
    address: {
        street: String,
        city: String,
        state: String,
        country: String,
        postalCode: String,
        formatted: String
    },
    event: {
        type: {
            type: String,
            enum: [
                'LOCATION_UPDATE',
                'GEOFENCE_ENTER',
                'GEOFENCE_EXIT',
                'LOW_BATTERY',
                'POWER_CONNECTED',
                'POWER_DISCONNECTED',
                'DEVICE_SHUTDOWN',
                'DEVICE_STARTUP',
                'MOTION_START',
                'MOTION_STOP',
                'SPEED_ALERT',
                'SIGNAL_LOST',
                'SIGNAL_RESTORED'
            ],
            default: 'LOCATION_UPDATE'
        },
        description: String
    },
    metadata: {
        type: Map,
        of: mongoose.Schema.Types.Mixed
    }
}, {
    timestamps: true
});

// Indexes for efficient querying
trackingDataSchema.index({ imei: 1, timestamp: -1 });
trackingDataSchema.index({ timestamp: -1 });
trackingDataSchema.index({ 'event.type': 1 });
trackingDataSchema.index({ latitude: 1, longitude: 1 });

// Method to calculate distance from another point
trackingDataSchema.methods.distanceTo = function(lat, lon) {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = this.latitude * Math.PI / 180;
    const φ2 = lat * Math.PI / 180;
    const Δφ = (lat - this.latitude) * Math.PI / 180;
    const Δλ = (lon - this.longitude) * Math.PI / 180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c; // Distance in meters
};

// Static method to calculate total distance for a set of tracking points
trackingDataSchema.statics.calculateTotalDistance = async function(imei, startTime, endTime) {
    const points = await this.find({
        imei,
        timestamp: { $gte: startTime, $lte: endTime }
    }).sort('timestamp');

    let totalDistance = 0;
    for (let i = 1; i < points.length; i++) {
        totalDistance += points[i].distanceTo(points[i-1].latitude, points[i-1].longitude);
    }

    return totalDistance;
};

// Static method to get average speed between two timestamps
trackingDataSchema.statics.getAverageSpeed = async function(imei, startTime, endTime) {
    const result = await this.aggregate([
        {
            $match: {
                imei,
                timestamp: { $gte: startTime, $lte: endTime },
                speed: { $exists: true }
            }
        },
        {
            $group: {
                _id: null,
                avgSpeed: { $avg: '$speed' }
            }
        }
    ]);

    return result.length > 0 ? result[0].avgSpeed : 0;
};

// Static method to get movement summary
trackingDataSchema.statics.getMovementSummary = async function(imei, startTime, endTime) {
    const points = await this.find({
        imei,
        timestamp: { $gte: startTime, $lte: endTime }
    }).sort('timestamp');

    if (points.length < 2) {
        return {
            totalDistance: 0,
            averageSpeed: 0,
            maxSpeed: 0,
            movingTime: 0,
            stoppedTime: 0,
            startPoint: points[0] || null,
            endPoint: points[0] || null
        };
    }

    let totalDistance = 0;
    let maxSpeed = 0;
    let movingTime = 0;
    let lastMovingTime = null;

    for (let i = 1; i < points.length; i++) {
        const distance = points[i].distanceTo(points[i-1].latitude, points[i-1].longitude);
        totalDistance += distance;
        maxSpeed = Math.max(maxSpeed, points[i].speed || 0);

        // Consider moving if speed > 1 km/h
        if ((points[i].speed || 0) > 1) {
            if (!lastMovingTime) {
                lastMovingTime = points[i].timestamp;
            }
        } else if (lastMovingTime) {
            movingTime += points[i].timestamp - lastMovingTime;
            lastMovingTime = null;
        }
    }

    // Add final moving segment if exists
    if (lastMovingTime) {
        movingTime += points[points.length - 1].timestamp - lastMovingTime;
    }

    const totalTime = points[points.length - 1].timestamp - points[0].timestamp;
    const stoppedTime = totalTime - movingTime;

    return {
        totalDistance,
        averageSpeed: totalDistance / (totalTime / 1000 / 3600), // km/h
        maxSpeed,
        movingTime,
        stoppedTime,
        startPoint: points[0],
        endPoint: points[points.length - 1]
    };
};

module.exports = mongoose.model('TrackingData', trackingDataSchema);
