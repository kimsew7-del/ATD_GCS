const DEFAULT_CONFIG = {
  transportMode: "mock",
  realServerUrl: "ws://127.0.0.1:9000/ws",
};

export function loadRuntimeConfig() {
  const params = new URLSearchParams(window.location.search);
  const storedMode = window.localStorage.getItem("atd_gcs_transport_mode");
  const storedUrl = window.localStorage.getItem("atd_gcs_real_server_url");

  const transportMode = params.get("transport") || storedMode || DEFAULT_CONFIG.transportMode;
  const realServerUrl = params.get("server") || storedUrl || DEFAULT_CONFIG.realServerUrl;

  return {
    transportMode,
    realServerUrl,
  };
}

export function persistRuntimeConfig(config) {
  window.localStorage.setItem("atd_gcs_transport_mode", config.transportMode);
  window.localStorage.setItem("atd_gcs_real_server_url", config.realServerUrl);
}
