"""
Utility functions for calculating squat form scores.
"""


def calc_hip_flexion_score(angle):
    """Return a score (0-100) based on hip flexion angle.

    Ideal hip flexion lies between 90° and 120°.  Anything <90° suggests
    insufficient hip loading, whereas >130° often indicates excessive torso
    lean / compensation.  We grant full marks (100) between 90-120°.  Between
    70-90° (shallow flexion) we linearly scale 0→100.  Between 120-130° we
    linearly scale 100→0.  Outside 70-130° we assign 0.
    """
    if angle is None:
        return 0.0

    if 90 <= angle <= 120:
        return 100.0
    # Shallow flexion side
    if 70 <= angle < 90:
        return (angle - 70) / 20.0 * 100.0  # 70→0 , 90→100
    # Excessive flexion side
    if 120 < angle <= 130:
        return (130 - angle) / 10.0 * 100.0  # 120→100 , 130→0
    return 0.0


def calc_pelvic_tilt_score(delta_angle):
    """Return a score (0-100) based on posterior pelvic tilt change (delta in °).

    Starts at 100 (perfect).  Any change ≤5° keeps 100.  15° or more drops to 0.
    Linear drop in between.  delta_angle should be a positive magnitude (abs).
    """
    if delta_angle is None:
        return 100.0  # Unknown tilt, assume perfect so we don't punish
    if delta_angle <= 5:
        return 100.0
    if delta_angle >= 15:
        return 0.0
    return (15 - delta_angle) / 10.0 * 100.0


def calc_depth_score(angle, hip_below_knee):
    """Calculate depth score from knee angle."""
    # Grant full points for very deep squats (below parallel or <70°)
    if hip_below_knee or angle <= 70:
        return 100.0
    # No points for shallow squats above 90°
    elif angle >= 90:
        return 0.0
    # Linear score for angles between 70° and 90°
    else:
        return ((90 - angle) / 20.0) * 100.0


def calc_shoulder_score(diff):
    """Calculate shoulder alignment score from shoulder-midfoot difference."""
    abs_diff = abs(diff)
    if abs_diff <= 2:
        return 100.0
    elif abs_diff >= 10:
        return 0.0
    else:
        return (10 - abs_diff) / 8 * 100.0
