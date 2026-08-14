import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true, lowercase: true },
    password_hash: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    role: { type: String, enum: ['admin', 'devotee'], default: 'devotee' },
    quota: { type: Number, default: () => parseInt(process.env.DEVOTEE_DEFAULT_QUOTA, 10) || 30 },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

export default mongoose.models.User || mongoose.model('User', userSchema);
