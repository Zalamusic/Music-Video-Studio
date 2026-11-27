
import numpy as np

def assess_motion(points):
    p = np.asarray(points, dtype=np.float64)

    if p.ndim != 3 or p.shape[1] != 144:
        raise ValueError("Expected 144 landmarks")

    if p.shape[0] < 3 or p.shape[2] < 2:
        raise ValueError("Insufficient motion data")

    xy = p[..., :2]

    if not np.isfinite(xy).all():
        raise ValueError("Invalid coordinates")

    velocity = np.diff(xy, axis=0)
    acceleration = np.diff(velocity, axis=0)

    speed = np.linalg.norm(velocity, axis=-1)
    accel = np.linalg.norm(acceleration, axis=-1)

    median = float(np.median(accel))
    mad = float(np.median(np.abs(accel - median)))
    threshold = median + 6 * max(1.4826 * mad, 1e-9)

    candidates = np.argwhere(accel > threshold)

    return {
        "frames": int(len(xy)),
        "landmarks": 144,
        "mean_displacement": float(speed.mean()),
        "peak_acceleration": float(accel.max()),
        "review_candidates": [
            {"frame": int(f + 1), "landmark": int(j)}
            for f, j in candidates
        ],
        "camera_motion_separated": False,
        "automatic_correction": False,
        "threshold_calibrated": False
    }
