function numberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function extractGeoState(vehicle, tracker) {
  const vehicleLat =
    numberOrNull(vehicle?.latitude_deg) ??
    numberOrNull(vehicle?.lat) ??
    null;
  const vehicleLng =
    numberOrNull(vehicle?.longitude_deg) ??
    numberOrNull(vehicle?.lon) ??
    null;
  const targetLat =
    numberOrNull(tracker?.target_latitude_deg) ??
    numberOrNull(tracker?.target_lat_deg) ??
    null;
  const targetLng =
    numberOrNull(tracker?.target_longitude_deg) ??
    numberOrNull(tracker?.target_lon_deg) ??
    null;

  return {
    hasVehicleGeo: vehicleLat !== null && vehicleLng !== null,
    hasTargetGeo: targetLat !== null && targetLng !== null,
    vehicleLat,
    vehicleLng,
    targetLat,
    targetLng,
  };
}

export function extractVideoMetadata(tracker) {
  return {
    bboxX: numberOrNull(tracker?.bbox_x_norm) ?? numberOrNull(tracker?.predicted_center_x_norm) ?? 0,
    bboxY: numberOrNull(tracker?.bbox_y_norm) ?? numberOrNull(tracker?.predicted_center_y_norm) ?? 0,
    bboxW: numberOrNull(tracker?.bbox_w_norm) ?? null,
    bboxH: numberOrNull(tracker?.bbox_h_norm) ?? null,
    confidence: numberOrNull(tracker?.target_confidence) ?? 0,
    frameTimestamp: numberOrNull(tracker?.frame_timestamp),
    targetId: tracker?.target_id ?? tracker?.target_index ?? null,
  };
}

export function buildMapFallback(vehicle, tracker) {
  const roll = numberOrNull(vehicle?.roll_deg) ?? 0;
  const pitch = numberOrNull(vehicle?.pitch_deg) ?? 0;
  const xNorm = numberOrNull(tracker?.predicted_center_x_norm) ?? 0;
  const yNorm = numberOrNull(tracker?.predicted_center_y_norm) ?? 0;

  const vehicleLat = 37.5665 + pitch * -0.00008;
  const vehicleLng = 126.978 + roll * 0.00008;
  const targetLat = vehicleLat + yNorm * -0.0024;
  const targetLng = vehicleLng + xNorm * 0.0024;

  return {
    vehicleLat,
    vehicleLng,
    targetLat,
    targetLng,
  };
}
