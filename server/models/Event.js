import mongoose from 'mongoose';

const eventSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    event_code: { type: String, trim: true, default: '' },
    location: { type: String, trim: true, default: '' },
    date: { type: String, default: '' },
    // Full start/end timestamps from the main system — used to decide whether
    // an event is live/upcoming (shown) or completed (hidden).
    date_start: { type: String, default: '' },
    date_end: { type: String, default: '' },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

export default mongoose.models.Event || mongoose.model('Event', eventSchema);
