import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true, lowercase: true },
    password_hash: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    // Devotee's email address on the main ISKCON system (= the preacher email).
    // Shown in the admin Users page so admins can match devotees to preachers.
    email: { type: String, trim: true, lowercase: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    role: { type: String, enum: ['admin', 'devotee'], default: 'devotee' },
    quota: { type: Number, default: () => parseInt(process.env.DEVOTEE_DEFAULT_QUOTA, 10) || 30 },
    // Per-event quotas. Supports two formats:
    //   { eventId: number }            — total passes for that event
    //   { eventId: { catCode: number } } — per-category limits within an event
    // When set for an event, overrides the global `quota` for that event.
    event_quotas: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} },
    // The devotee's 4-character preacher code on the main ISKCON system (e.g.
    // MKGD). Passes issued by this devotee are attributed to that preacher.
    short_code: { type: String, trim: true, uppercase: true, default: '' },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

export default mongoose.models.User || mongoose.model('User', userSchema);
