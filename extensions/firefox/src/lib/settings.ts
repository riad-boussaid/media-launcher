export interface Settings {
  serverUrl: string;
  maxHeight: string;
  mpvArgs: string;
  showThumb: boolean;
}

export const defaultSettings: Settings = {
  serverUrl: "http://localhost:5000",
  maxHeight: "a",
  mpvArgs: "",
  showThumb: false,
};
