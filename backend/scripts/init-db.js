require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Settings = require('../models/Settings');

async function initializeDatabase() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/trax-gps', {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('Connected to MongoDB');

        // Check if admin user exists
        const adminExists = await User.findOne({ username: 'admin' });
        if (!adminExists) {
            // Create admin user
            const hashedPassword = await bcrypt.hash('admin123', 10);
            await User.create({
                username: 'admin',
                password: hashedPassword,
                role: 'admin',
                email: 'admin@example.com',
                active: true,
                notificationPreferences: {
                    email: true,
                    sms: false,
                    push: true
                }
            });
            console.log('Admin user created successfully');
        }

        // Check if default settings exist
        const settingsExist = await Settings.findOne();
        if (!settingsExist) {
            // Create default settings
            await Settings.create({
                updateInterval: 5,
                defaultZoom: 12,
                distanceUnit: 'km',
                defaultRadius: 100,
                alertBuffer: 30,
                enableGeofencing: false,
                notifications: {
                    email: {
                        enabled: false,
                        server: {
                            host: process.env.SMTP_HOST,
                            port: parseInt(process.env.SMTP_PORT),
                            secure: false,
                            auth: {
                                user: process.env.SMTP_USER,
                                pass: process.env.SMTP_PASS
                            }
                        },
                        sender: {
                            name: 'Trax GPS Tracker',
                            email: process.env.SMTP_FROM
                        }
                    },
                    sms: {
                        enabled: false,
                        provider: {
                            name: process.env.SMS_PROVIDER,
                            apiKey: process.env.SMS_API_KEY,
                            apiSecret: process.env.SMS_API_SECRET
                        }
                    },
                    push: {
                        enabled: false,
                        vapidKeys: {
                            public: process.env.VAPID_PUBLIC_KEY,
                            private: process.env.VAPID_PRIVATE_KEY
                        }
                    }
                },
                map: {
                    provider: 'google',
                    apiKey: process.env.GOOGLE_MAPS_API_KEY
                }
            });
            console.log('Default settings created successfully');
        }

        console.log('Database initialization completed');
        process.exit(0);
    } catch (error) {
        console.error('Error initializing database:', error);
        process.exit(1);
    }
}

initializeDatabase();
