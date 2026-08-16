export interface Settings {
  serverUrl: string;
  maxHeight: string;
  codec: string;
  mpvArgs: string;
  showThumb: boolean;
  volume: number;
  speed: number;
  subLang: string;
  loop: boolean;
}

export const defaultSettings: Settings = {
  serverUrl: "http://localhost:5000",
  maxHeight: "a",
  codec: "any",
  mpvArgs: "",
  showThumb: false,
  volume: 100,
  speed: 1,
  subLang: "",
  loop: false,
};
