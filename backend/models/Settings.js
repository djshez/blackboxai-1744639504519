const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
    // General Settings
    updateInterval: {
        type: Number,
        default: 5,
        min: 1,
        max: 3600,
        description: 'Location update interval in seconds'
    },
    defaultZoom: {
        type: Number,
        default: 12,
        min: 1,
        max: 20,
        description: 'Default map zoom level'
    },
    distanceUnit: {
        type: String,
        enum: ['km', 'mi'],
        default: 'km',
        description: 'Unit for displaying distances'
    },

    // Geofencing Settings
    defaultRadius: {
        type: Number,
        default: 100,
        min: 50,
        description: 'Default geofence radius in meters'
    },
    alertBuffer: {
        type: Number,
        default: 30,
        min: 0,
        description: 'Buffer time in seconds before triggering geofence alerts'
    },
    enableGeofencing: {
        type: Boolean,
        default: false,
        description: 'Enable geofencing by default for new devices'
    },

    // Notification Settings
    notifications: {
        email: {
            enabled: {
                type: Boolean,
                default: false
            },
            server: {
                host: String,
                port: Number,
                secure: Boolean,
                auth: {
                    user: String,
                    pass: String
                }
            },
            sender: {
                name: String,
                email: String
            }
        },
        sms: {
            enabled: {
                type: Boolean,
                default: false
            },
            provider: {
                name: String,
                apiKey: String,
                apiSecret: String
            }
        },
        push: {
            enabled: {
                type: Boolean,
                default: false
            },
            vapidKeys: {
                public: String,
                private: String
            }
        }
    },

    // Alert Settings
    alerts: {
        lowBattery: {
            enabled: {
                type: Boolean,
                default: true
            },
            threshold: {
                type: Number,
                default: 20,
                min: 1,
                max: 100
            }
        },
        speedLimit: {
            enabled: {
                type: Boolean,
                default: true
            },
            threshold: {
                type: Number,
                default: 120,
                min: 0
            }
        },
        signalLoss: {
            enabled: {
                type: Boolean,
                default: true
            },
            timeout: {
                type: Number,
                default: 300,
                min: 60
            }
        },
        idleTime: {
            enabled: {
                type: Boolean,
                default: true
            },
            threshold: {
                type: Number,
                default: 1800,
                min: 300
            }
        }
    },

    // Map Settings
    map: {
        provider: {
            type: String,
            enum: ['google', 'mapbox', 'osm'],
            default: 'google'
        },
        apiKey: String,
        style: String,
        defaultCenter: {
            latitude: {
                type: Number,
                default: 0
            },
            longitude: {
                type: Number,
                default: 0
            }
        }
    },

    // Data Retention
    dataRetention: {
        trackingData: {
            enabled: {
                type: Boolean,
                default: true
            },
            duration: {
                type: Number,
                default: 90,
                min: 1,
                description: 'Number of days to keep tracking data'
            }
        },
        alerts: {
            enabled: {
                type: Boolean,
                default: true
            },
            duration: {
                type: Number,
                default: 180,
                min: 1,
                description: 'Number of days to keep alert history'
            }
        }
    },

    // Security Settings
    security: {
        sessionTimeout: {
            type: Number,
            default: 3600,
            min: 300,
            description: 'Session timeout in seconds'
        },
        maxLoginAttempts: {
            type: Number,
            default: 5,
            min: 1
        },
        lockoutDuration: {
            type: Number,
            default: 900,
            min: 300,
            description: 'Account lockout duration in seconds'
        },
        passwordPolicy: {
            minLength: {
                type: Number,
                default: 8,
                min: 6
            },
            requireNumbers: {
                type: Boolean,
                default: true
            },
            requireSpecialChars: {
                type: Boolean,
                default: true
            },
            requireUppercase: {
                type: Boolean,
                default: true
            },
            passwordExpiry: {
                type: Number,
                default: 90,
                min: 0,
                description: 'Password expiry in days (0 for never)'
            }
        }
    },

    // System Settings
    system: {
        maintenance: {
            enabled: {
                type: Boolean,
                default: false
            },
            message: String,
            scheduledStart: Date,
            scheduledEnd: Date
        },
        timezone: {
            type: String,
            default: 'UTC'
        },
        dateFormat: {
            type: String,
            default: 'YYYY-MM-DD'
        },
        timeFormat: {
            type: String,
            default: 'HH:mm:ss'
        }
    }
}, {
    timestamps: true,
    collection: 'settings'
});

// Ensure only one settings document exists
settingsSchema.pre('save', async function(next) {
    const count = await this.constructor.countDocuments();
    if (count > 0 && !this.isModified()) {
        const err = new Error('Only one settings document can exist');
        next(err);
    }
    next();
});

// Method to validate email configuration
settingsSchema.methods.validateEmailConfig = function() {
    if (!this.notifications.email.enabled) return true;
    
    const { server, sender } = this.notifications.email;
    return server.host && 
           server.port && 
           server.auth.user && 
           server.auth.pass && 
           sender.email;
};

// Method to validate SMS configuration
settingsSchema.methods.validateSMSConfig = function() {
    if (!this.notifications.sms.enabled) return true;
    
    const { provider } = this.notifications.sms;
    return provider.name && 
           provider.apiKey && 
           provider.apiSecret;
};

// Method to get notification channels
settingsSchema.methods.getActiveNotificationChannels = function() {
    const channels = [];
    if (this.notifications.email.enabled) channels.push('email');
    if (this.notifications.sms.enabled) channels.push('sms');
    if (this.notifications.push.enabled) channels.push('push');
    return channels;
};

// Static method to get settings
settingsSchema.statics.getSettings = async function() {
    let settings = await this.findOne();
    if (!settings) {
        settings = await this.create({});
    }
    return settings;
};

module.exports = mongoose.model('Settings', settingsSchema);
