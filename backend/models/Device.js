const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema({
    imei: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        match: [/^\d{15}$/, 'Please enter a valid 15-digit IMEI number']
    },
    name: {
        type: String,
        trim: true
    },
    description: {
        type: String,
        trim: true
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
            max: 100,
            default: 100
        },
        charging: {
            type: Boolean,
            default: false
        }
    },
    signal: {
        strength: {
            type: Number,
            min: 0,
            max: 100,
            default: 100
        },
        type: {
            type: String,
            enum: ['NONE', '2G', '3G', '4G', '5G', 'WIFI'],
            default: 'NONE'
        }
    },
    online: {
        type: Boolean,
        default: false
    },
    lastSeen: {
        type: Date,
        default: Date.now
    },
    shutdownRequested: {
        type: Boolean,
        default: false
    },
    shutdownRequestedBy: {
        type: String,
        default: null
    },
    shutdownRequestedAt: {
        type: Date,
        default: null
    },
    shutdownExecutedAt: {
        type: Date,
        default: null
    },
    geofence: {
        enabled: {
            type: Boolean,
            default: false
        },
        radius: {
            type: Number,
            default: 100,
            min: 50
        },
        center: {
            latitude: {
                type: Number,
                min: -90,
                max: 90
            },
            longitude: {
                type: Number,
                min: -180,
                max: 180
            }
        },
        alerts: {
            onEnter: {
                type: Boolean,
                default: true
            },
            onExit: {
                type: Boolean,
                default: true
            },
            onIdle: {
                type: Boolean,
                default: false
            }
        }
    },
    settings: {
        updateInterval: {
            type: Number,
            default: 5,
            min: 1
        },
        powerSaveMode: {
            type: Boolean,
            default: false
        },
        motionDetection: {
            type: Boolean,
            default: true
        }
    },
    assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    tags: [{
        type: String,
        trim: true
    }],
    status: {
        type: String,
        enum: ['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'LOST'],
        default: 'ACTIVE'
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Index for geospatial queries
deviceSchema.index({ 'latitude': 1, 'longitude': 1 });

// Index for IMEI searches
deviceSchema.index({ 'imei': 1 });

// Middleware to update lastSeen timestamp
deviceSchema.pre('save', function(next) {
    if (this.isModified('latitude') || this.isModified('longitude')) {
        this.lastSeen = Date.now();
    }
    next();
});

// Method to check if device is within geofence
deviceSchema.methods.isWithinGeofence = function() {
    if (!this.geofence.enabled || !this.geofence.center.latitude || !this.geofence.center.longitude) {
        return true;
    }

    const R = 6371e3; // Earth's radius in meters
    const φ1 = this.latitude * Math.PI / 180;
    const φ2 = this.geofence.center.latitude * Math.PI / 180;
    const Δφ = (this.geofence.center.latitude - this.latitude) * Math.PI / 180;
    const Δλ = (this.geofence.center.longitude - this.longitude) * Math.PI / 180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;

    return distance <= this.geofence.radius;
};

// Virtual for device age
deviceSchema.virtual('age').get(function() {
    return Math.floor((Date.now() - this.createdAt) / (1000 * 60 * 60 * 24));
});

// Ensure virtuals are included in JSON output
deviceSchema.set('toJSON', { virtuals: true });
deviceSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Device', deviceSchema);
