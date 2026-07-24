import { exec } from "child_process";

export const lunchMPV = (url) => {
  let command = `mpv "${url}"`;
  exec(command, { shell: true });
  console.log(`- ${url}`);
};

// const getTitle = `yt-dlp --print "%(title)s" "${url}" --extractor-args "youtube:player_client=web"`;

// exec(command, { shell: true }, (error, data) => {
//   if (error) {
//     console.log(`\nError: ${error.message}\n`);
//     return;
//   }
// });

// exec(getTitle, (error, data) => {
// if (error) {
// console.log(error.message);
// return;
// }

// console.log(`• ${data}`);
// });
