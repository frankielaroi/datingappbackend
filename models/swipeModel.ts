import mongoose from "mongoose";
const Schema = mongoose.Schema;

export const SWIPE_ACTIONS = ["like", "pass"] as const;
export type SwipeAction = (typeof SWIPE_ACTIONS)[number];

// One row per (swiper, target) pair. Swiping again on the same person
// changes the action rather than adding a row.
const swipeSchema = new Schema(
  {
    swiper: { type: Schema.Types.ObjectId, ref: "User", required: true },
    target: { type: Schema.Types.ObjectId, ref: "User", required: true },
    action: { type: String, enum: SWIPE_ACTIONS, required: true },
  },
  { timestamps: true }
);

// Everyone I've swiped on (excluded from my matches), newest first.
swipeSchema.index({ swiper: 1, target: 1 }, { unique: true });
swipeSchema.index({ swiper: 1, createdAt: -1 });
// "Did they like me back?" and "who liked me".
swipeSchema.index({ target: 1, action: 1, swiper: 1 });

const Swipe = mongoose.model("Swipe", swipeSchema);

export default Swipe;
